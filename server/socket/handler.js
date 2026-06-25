const jwt = require('jsonwebtoken');

/**
 * Socket Handler — Zynk
 * @param {import('socket.io').Server} io
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {Function} sendPushToUser - helper from server.js to deliver Web Push
 */
function setupSocketHandlers(io, db, sendPushToUser) {
  // ── Authentication middleware ────────────────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error'));
    jwt.verify(token, process.env.JWT_SECRET || 'zynk-secret-key-change-in-production', (err, decoded) => {
      if (err) return next(new Error('Authentication error'));
      socket.user = decoded;
      next();
    });
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id;

    // ── On connect: mark online, join rooms, broadcast status ────────────
    try {
      db.prepare(`UPDATE users SET is_online = 1 WHERE id = ?`).run(userId);

      // Join personal room (for direct notifications like incoming_call)
      socket.join(userId);

      // Join all conversation rooms
      const conversations = db.prepare(
        `SELECT conversation_id FROM conversation_members WHERE user_id = ?`
      ).all(userId);
      conversations.forEach(c => socket.join(c.conversation_id));

      // Broadcast online status to everyone
      io.emit('user_online', { userId });

      // Send current online user list to the newly connected socket
      const onlineUserIds = db.prepare(`SELECT id FROM users WHERE is_online = 1`).all().map(u => u.id);
      socket.emit('online_users', { userIds: onlineUserIds });

      // Mark all undelivered messages from others in these conversations as delivered
      const undelivered = db.prepare(`
        SELECT m.id, m.conversation_id, m.sender_id
        FROM messages m
        JOIN conversation_members cm ON cm.conversation_id = m.conversation_id
        WHERE cm.user_id = ?
          AND m.sender_id != ?
          AND m.is_deleted = 0
          AND m.id NOT IN (SELECT message_id FROM message_deliveries WHERE user_id = ?)
      `).all(userId, userId, userId);

      if (undelivered.length > 0) {
        const insertDel = db.prepare(`INSERT OR IGNORE INTO message_deliveries (message_id, user_id) VALUES (?, ?)`);
        db.exec('BEGIN');
        try {
          for (const msg of undelivered) {
            insertDel.run(msg.id, userId);
          }
          db.exec('COMMIT');
        } catch (txErr) {
          db.exec('ROLLBACK');
          console.error('[SOCKET] Error bulk marking delivered:', txErr);
        }

        // Notify other conversation members/rooms of the delivery
        const convGroups = {};
        for (const msg of undelivered) {
          if (!convGroups[msg.conversation_id]) convGroups[msg.conversation_id] = [];
          convGroups[msg.conversation_id].push(msg.id);
        }

        for (const [convId, msgIds] of Object.entries(convGroups)) {
          io.to(convId).emit('messages_delivered', { conversationId: convId, messageIds: msgIds, userId });
        }
      }
    } catch (err) {
      console.error('[SOCKET] Error on connect:', err);
    }

    // ── Disconnect ───────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      try {
        db.prepare(`UPDATE users SET is_online = 0, last_seen = CURRENT_TIMESTAMP WHERE id = ?`).run(userId);
        io.emit('user_offline', { userId, lastSeen: new Date().toISOString() });

        // Clean up any group calls the user was in
        if (io._groupCalls) {
          for (const [gid] of io._groupCalls) {
            if (io._groupCalls.get(gid)?.participants.has(userId)) {
              const call = io._groupCalls.get(gid);
              call.participants.delete(userId);
              if (call.participants.size === 0) {
                io._groupCalls.delete(gid);
              } else {
                io.to(gid).emit('group_call_participant_left', { userId });
              }
            }
          }
        }
      } catch (err) {
        console.error('[SOCKET] Error on disconnect:', err);
      }
    });

    // ── Group Joined (new member added via REST) ──────────────────────────
    // The REST POST /:id/members route emits 'group_joined' to the new member's
    // personal room. This handler makes their socket join the group's IO room
    // so they immediately receive future messages without reconnecting.
    socket.on('group_joined', ({ groupId }) => {
      socket.join(groupId);
      console.log(`[SOCKET] ${userId} joined group room ${groupId}`);
    });

    // ── Send Message ─────────────────────────────────────────────────────
    socket.on('send_message', (data) => {
      const { conversationId, content, type, fileUrl, fileName, fileSize, messageId } = data;
      try {
        // Verify sender is in conversation
        if (!db.prepare(`SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?`).get(conversationId, userId)) {
          return;
        }

        const id = messageId || require('crypto').randomUUID();
        db.prepare(`
          INSERT INTO messages (id, conversation_id, sender_id, content, type, file_url, file_name, file_size)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, conversationId, userId, content || null, type || 'text', fileUrl || null, fileName || null, fileSize || null);

        const m = db.prepare(`
          SELECT m.id, m.conversation_id, m.sender_id, m.content, m.type,
                 m.file_url, m.file_name, m.file_size, m.is_deleted, m.created_at,
                 u.username AS sender_username, u.display_name AS sender_display_name,
                 u.avatar_url AS sender_avatar
          FROM messages m
          JOIN users u ON u.id = m.sender_id
          WHERE m.id = ?
        `).get(id);

        if (!m) return;

        const message = {
          id: m.id,
          conversation_id: m.conversation_id,
          sender_id: m.sender_id,
          content: m.content,
          type: m.type,
          file_url: m.file_url,
          file_name: m.file_name,
          file_size: m.file_size,
          is_deleted: m.is_deleted,
          created_at: m.created_at,
          status: 'sent',
          sender: {
            id: m.sender_id,
            username: m.sender_username,
            display_name: m.sender_display_name,
            avatar_url: m.sender_avatar
          }
        };

        // Broadcast to all sockets in the conversation room
        io.to(conversationId).emit('new_message', message);

        // ── Web Push for offline members ──────────────────────────────────
        if (sendPushToUser) {
          const senderName = m.sender_display_name || m.sender_username;
          let bodyText = '';
          if (type === 'text')       bodyText = content;
          else if (type === 'image') bodyText = '📷 Photo';
          else if (type === 'audio') bodyText = '🎵 Voice message';
          else                       bodyText = '📎 File';

          // Get all conversation members except the sender
          const members = db.prepare(
            `SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?`
          ).all(conversationId, userId);

          members.forEach(member => {
            // Only push if they are offline (is_online = 0)
            const targetUser = db.prepare(`SELECT is_online FROM users WHERE id = ?`).get(member.user_id);
            if (targetUser && targetUser.is_online === 0) {
              sendPushToUser(db, member.user_id, {
                title: senderName,
                body: bodyText,
                icon: '/manifest-icon-192.png',
                badge: '/manifest-icon-192.png',
                tag: `msg-${conversationId}`,
                data: {
                  type: 'message',
                  conversationId,
                  messageId: message.id,
                  url: '/'
                }
              });
            }
          });
        }
      } catch (err) {
        console.error('[SOCKET] Error sending message:', err);
      }
    });

    // ── Typing indicators ────────────────────────────────────────────────
    socket.on('typing_start', ({ conversationId }) => {
      socket.to(conversationId).emit('user_typing', { conversationId, userId });
    });

    socket.on('typing_stop', ({ conversationId }) => {
      socket.to(conversationId).emit('user_stop_typing', { conversationId, userId });
    });

    // ── Read Receipts ────────────────────────────────────────────────────
    socket.on('message_read', ({ messageId, conversationId }) => {
      try {
        if (messageId) {
          db.prepare(`INSERT OR IGNORE INTO message_reads (message_id, user_id) VALUES (?, ?)`).run(messageId, userId);
          io.to(conversationId).emit('message_read', { messageId, conversationId, userId });
        } else if (conversationId) {
          // Mark all unread messages from others as read
          const unreadMessages = db.prepare(`
            SELECT id FROM messages
            WHERE conversation_id = ?
              AND sender_id != ?
              AND is_deleted = 0
              AND id NOT IN (SELECT message_id FROM message_reads WHERE user_id = ?)
          `).all(conversationId, userId, userId);

          const insertStmt = db.prepare(`INSERT OR IGNORE INTO message_reads (message_id, user_id) VALUES (?, ?)`);
          db.exec('BEGIN');
          try {
            for (const msg of unreadMessages) {
              insertStmt.run(msg.id, userId);
            }
            db.exec('COMMIT');
          } catch (txErr) {
            db.exec('ROLLBACK');
            throw txErr;
          }

          io.to(conversationId).emit('conversation_read', { conversationId, userId });
        }
      } catch (err) {
        console.error('[SOCKET] Error marking read:', err);
      }
    });

    // ── Delivery Receipts ────────────────────────────────────────────────
    socket.on('message_delivered', ({ messageId, conversationId }) => {
      try {
        if (messageId) {
          db.prepare(`INSERT OR IGNORE INTO message_deliveries (message_id, user_id) VALUES (?, ?)`).run(messageId, userId);
          io.to(conversationId).emit('message_delivered', { messageId, conversationId, userId });
        }
      } catch (err) {
        console.error('[SOCKET] Error marking delivered:', err);
      }
    });

    // ── Delete Message ───────────────────────────────────────────────────
    socket.on('delete_message', ({ messageId, conversationId }) => {
      try {
        const msg = db.prepare(`SELECT sender_id FROM messages WHERE id = ?`).get(messageId);
        if (msg && msg.sender_id === userId) {
          db.prepare(`UPDATE messages SET is_deleted = 1 WHERE id = ?`).run(messageId);
          io.to(conversationId).emit('message_deleted', { messageId, conversationId });
        }
      } catch (err) {
        console.error('[SOCKET] Error deleting message:', err);
      }
    });

    // ── Edit Message ─────────────────────────────────────────────────────
    socket.on('edit_message', ({ messageId, conversationId, newContent }) => {
      try {
        const msg = db.prepare(`SELECT sender_id, type FROM messages WHERE id = ?`).get(messageId);
        if (msg && msg.sender_id === userId && msg.type === 'text') {
          db.prepare(`UPDATE messages SET content = ? WHERE id = ?`).run(newContent, messageId);
          io.to(conversationId).emit('message_edited', { messageId, conversationId, content: newContent });
        }
      } catch (err) {
        console.error('[SOCKET] Error editing message:', err);
      }
    });

    // ── Join Conversation Room ───────────────────────────────────────────
    socket.on('join_conversation', ({ conversationId }) => {
      socket.join(conversationId);
    });

    // ── WebRTC Calling Events ────────────────────────────────────────────
    socket.on('call_user', ({ targetUserId, signalData, type }) => {
      const callerName = socket.user.display_name || socket.user.username;
      const callerAvatar = socket.user.avatar_url;

      io.to(targetUserId).emit('incoming_call', {
        from: userId,
        callerName,
        callerAvatar,
        signalData,
        type
      });

      // ── Web Push for call if recipient is offline ─────────────────────
      if (sendPushToUser) {
        const targetUser = db.prepare(`SELECT is_online FROM users WHERE id = ?`).get(targetUserId);
        if (targetUser && targetUser.is_online === 0) {
          sendPushToUser(db, targetUserId, {
            title: `📞 Incoming ${type === 'video' ? 'Video' : 'Voice'} Call`,
            body: `${callerName} is calling you on Zynk`,
            icon: '/manifest-icon-192.png',
            badge: '/manifest-icon-192.png',
            tag: `call-${userId}`,
            requireInteraction: true,   // keeps notification visible until user acts
            data: {
              type: 'call',
              callType: type,
              callerId: userId,
              callerName,
              url: '/'
            }
          });
        }
      }
    });

    socket.on('accept_call', ({ targetUserId, signalData }) => {
      io.to(targetUserId).emit('call_accepted', { signalData });
    });

    socket.on('reject_call', ({ targetUserId }) => {
      io.to(targetUserId).emit('call_rejected');
    });

    socket.on('end_call', ({ targetUserId }) => {
      io.to(targetUserId).emit('call_ended');
    });

    socket.on('ice_candidate', ({ targetUserId, candidate }) => {
      io.to(targetUserId).emit('ice_candidate', { candidate });
    });

    // ── GROUP CALLS (WebRTC Mesh via Socket.IO signaling) ─────────────────
    // In-memory store: groupId → { type, participants: Map<userId, userInfo> }
    // Declared once per server process (shared across all connections)
    if (!io._groupCalls) io._groupCalls = new Map();
    const groupCalls = io._groupCalls;
    const GROUP_CALL_MAX = 8;

    // Helper: get user info from DB
    const getCallUserInfo = (uid) => {
      const u = db.prepare('SELECT id, display_name, username, avatar_url FROM users WHERE id = ?').get(uid);
      return u || { id: uid, display_name: 'Unknown', username: 'unknown', avatar_url: null };
    };

    // Helper: clean up a participant from a call room
    const leaveGroupCall = (groupId, uid) => {
      const call = groupCalls.get(groupId);
      if (!call) return;
      call.participants.delete(uid);
      if (call.participants.size === 0) {
        groupCalls.delete(groupId);
        console.log(`[CALL] Group call ended in ${groupId}`);
      } else {
        io.to(groupId).emit('group_call_participant_left', { userId: uid });
        console.log(`[CALL] ${uid} left group call in ${groupId}, ${call.participants.size} remaining`);
      }
    };

    // Start a group call (caller)
    socket.on('group_call_start', ({ groupId, callType }) => {
      try {
        // Check user is in the group
        const isMember = db.prepare(
          'SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?'
        ).get(groupId, userId);
        if (!isMember) return;

        // Check group size limit
        const existing = groupCalls.get(groupId);
        if (existing && existing.participants.size >= GROUP_CALL_MAX) {
          socket.emit('group_call_full', { max: GROUP_CALL_MAX });
          return;
        }

        // Create or join room
        if (!groupCalls.has(groupId)) {
          groupCalls.set(groupId, { type: callType, participants: new Map() });
        }
        const call = groupCalls.get(groupId);
        const callerInfo = getCallUserInfo(userId);
        call.participants.set(userId, callerInfo);

        // Tell caller: call started, here are existing participants (empty on first start)
        const existingParticipants = [...call.participants.entries()]
          .filter(([uid]) => uid !== userId)
          .map(([, info]) => info);
        socket.emit('group_call_ready', { groupId, callType, participants: existingParticipants });

        // Notify all group members of the incoming call
        const groupName = db.prepare('SELECT name FROM conversations WHERE id = ?').get(groupId)?.name || 'Group';
        const startedByName = callerInfo.display_name || callerInfo.username || 'Someone';
        const members = db.prepare(
          'SELECT user_id FROM conversation_members WHERE conversation_id = ?'
        ).all(groupId);
        members.forEach(({ user_id }) => {
          if (user_id !== userId) {
            io.to(user_id).emit('group_call_incoming', {
              groupId,
              groupName,
              callType,
              callerInfo,
              startedByName,
            });

            // ── Web Push for offline group members ─────────────────────────
            if (sendPushToUser) {
              const memberStatus = db.prepare(`SELECT is_online FROM users WHERE id = ?`).get(user_id);
              if (memberStatus && memberStatus.is_online === 0) {
                sendPushToUser(db, user_id, {
                  title: `📞 Group ${callType === 'video' ? 'Video' : 'Voice'} Call`,
                  body: `${startedByName} started a call in ${groupName}`,
                  icon: '/manifest-icon-192.png',
                  badge: '/manifest-icon-192.png',
                  tag: `group-call-${groupId}`,
                  requireInteraction: true,
                  data: {
                    type: 'group_call',
                    callType,
                    groupId,
                    groupName,
                    startedByName,
                    url: '/'
                  }
                });
              }
            }
          }
        });

        console.log(`[CALL] ${userId} started group ${callType} call in ${groupId}`);
      } catch (err) {
        console.error('[CALL] group_call_start error:', err);
      }
    });

    // Join an existing group call
    socket.on('group_call_join', ({ groupId }) => {
      try {
        const isMember = db.prepare(
          'SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?'
        ).get(groupId, userId);
        if (!isMember) return;

        const call = groupCalls.get(groupId);
        if (!call) {
          socket.emit('group_call_not_found', { groupId });
          return;
        }
        if (call.participants.size >= GROUP_CALL_MAX) {
          socket.emit('group_call_full', { max: GROUP_CALL_MAX });
          return;
        }

        const joinerInfo = getCallUserInfo(userId);
        call.participants.set(userId, joinerInfo);

        // Tell joiner: here are the existing participants — they'll create offers to each
        const existingParticipants = [...call.participants.entries()]
          .filter(([uid]) => uid !== userId)
          .map(([, info]) => info);
        socket.emit('group_call_ready', {
          groupId,
          callType: call.type,
          participants: existingParticipants,
        });

        // Tell existing participants: new peer joined, they should create offers to them
        socket.to(groupId).emit('group_call_participant_joined', {
          groupId,
          userInfo: joinerInfo,
        });

        console.log(`[CALL] ${userId} joined group call in ${groupId}, total: ${call.participants.size}`);
      } catch (err) {
        console.error('[CALL] group_call_join error:', err);
      }
    });

    // Leave a group call
    socket.on('group_call_leave', ({ groupId }) => {
      leaveGroupCall(groupId, userId);
    });

    // NOTE: group call cleanup on disconnect is merged into the main disconnect handler above (line 84)

    // Relay WebRTC offer to a specific peer
    socket.on('group_call_offer', ({ groupId, targetUserId, offer }) => {
      io.to(targetUserId).emit('group_call_offer', { groupId, fromUserId: userId, offer });
    });

    // Relay WebRTC answer to a specific peer
    socket.on('group_call_answer', ({ groupId, targetUserId, answer }) => {
      io.to(targetUserId).emit('group_call_answer', { groupId, fromUserId: userId, answer });
    });

    // Relay ICE candidate to a specific peer
    socket.on('group_call_ice', ({ groupId, targetUserId, candidate }) => {
      io.to(targetUserId).emit('group_call_ice', { groupId, fromUserId: userId, candidate });
    });
  });
}

module.exports = setupSocketHandlers;

