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
    } catch (err) {
      console.error('[SOCKET] Error on connect:', err);
    }

    // ── Disconnect ───────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      try {
        db.prepare(`UPDATE users SET is_online = 0, last_seen = CURRENT_TIMESTAMP WHERE id = ?`).run(userId);
        io.emit('user_offline', { userId, lastSeen: new Date().toISOString() });
      } catch (err) {
        console.error('[SOCKET] Error on disconnect:', err);
      }
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
  });
}

module.exports = setupSocketHandlers;
