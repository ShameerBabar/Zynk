const jwt = require('jsonwebtoken');

function setupSocketHandlers(io, db) {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }
    jwt.verify(token, process.env.JWT_SECRET || 'zynk-secret-key-change-in-production', (err, decoded) => {
      if (err) return next(new Error('Authentication error'));
      socket.user = decoded;
      next();
    });
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id;
    
    // Set user online
    try {
      const updateOnlineStmt = db.prepare(`UPDATE users SET is_online = 1 WHERE id = ?`);
      updateOnlineStmt.run(userId);
      
      // Join conversation rooms
      const getConversationsStmt = db.prepare(`SELECT conversation_id FROM conversation_members WHERE user_id = ?`);
      const conversations = getConversationsStmt.all(userId);
      conversations.forEach(c => {
        socket.join(c.conversation_id);
      });
      
      // Broadcast online status to contacts
      const getContactsStmt = db.prepare(`SELECT user_id FROM contacts WHERE contact_id = ?`);
      const contacts = getContactsStmt.all(userId);
      contacts.forEach(contact => {
         io.emit('user_online', { userId });
      });

      // Get all online users and send to the connecting socket
      const getOnlineUsersStmt = db.prepare(`SELECT id FROM users WHERE is_online = 1`);
      const onlineUserIds = getOnlineUsersStmt.all().map(u => u.id);
      socket.emit('online_users', { userIds: onlineUserIds });
      
    } catch (err) {
      console.error('Error on connect:', err);
    }

    socket.on('disconnect', () => {
      try {
        const updateOfflineStmt = db.prepare(`UPDATE users SET is_online = 0, last_seen = CURRENT_TIMESTAMP WHERE id = ?`);
        updateOfflineStmt.run(userId);
        
        io.emit('user_offline', { userId, lastSeen: new Date().toISOString() });
      } catch (err) {
        console.error('Error on disconnect:', err);
      }
    });

    socket.on('send_message', (data) => {
      const { conversationId, content, type, fileUrl, fileName, fileSize, messageId } = data;
      // Assume message is already saved to DB by REST API and this is just to broadcast, 
      // OR we save it here. The prompt says "Save message to DB with uuid".
      
      try {
        const insertStmt = db.prepare(`
          INSERT INTO messages (id, conversation_id, sender_id, content, type, file_url, file_name, file_size)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const id = messageId || require('crypto').randomUUID();
        
        // Verify sender is in conversation
        const checkMemberStmt = db.prepare(`SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?`);
        if (!checkMemberStmt.get(conversationId, userId)) {
            return; // Not a member
        }

        insertStmt.run(id, conversationId, userId, content || null, type || 'text', fileUrl || null, fileName || null, fileSize || null);
        
        const getMsgStmt = db.prepare(`
          SELECT m.id, m.conversation_id, m.sender_id, m.content, m.type,
                 m.file_url, m.file_name, m.file_size, m.is_deleted, m.created_at,
                 u.username AS sender_username, u.display_name AS sender_display_name,
                 u.avatar_url AS sender_avatar
          FROM messages m
          JOIN users u ON u.id = m.sender_id
          WHERE m.id = ?
        `);
        const m = getMsgStmt.get(id);
        
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

        io.to(conversationId).emit('new_message', message);
      } catch (err) {
        console.error('Error sending message:', err);
      }
    });

    socket.on('typing_start', ({ conversationId }) => {
      socket.to(conversationId).emit('user_typing', { conversationId, userId });
    });

    socket.on('typing_stop', ({ conversationId }) => {
      socket.to(conversationId).emit('user_stop_typing', { conversationId, userId });
    });

    socket.on('message_read', ({ messageId, conversationId }) => {
      try {
        const insertStmt = db.prepare(`INSERT OR IGNORE INTO message_reads (message_id, user_id) VALUES (?, ?)`);
        insertStmt.run(messageId, userId);
        io.to(conversationId).emit('message_read', { messageId, conversationId, userId });
      } catch (err) {
        console.error('Error marking read:', err);
      }
    });

    socket.on('delete_message', ({ messageId, conversationId }) => {
      try {
        const getMsgStmt = db.prepare(`SELECT sender_id FROM messages WHERE id = ?`);
        const msg = getMsgStmt.get(messageId);
        if (msg && msg.sender_id === userId) {
          const delStmt = db.prepare(`UPDATE messages SET is_deleted = 1 WHERE id = ?`);
          delStmt.run(messageId);
          io.to(conversationId).emit('message_deleted', { messageId, conversationId });
        }
      } catch (err) {
        console.error('Error deleting message:', err);
      }
    });

    socket.on('edit_message', ({ messageId, conversationId, newContent }) => {
      try {
        const getMsgStmt = db.prepare(`SELECT sender_id, type FROM messages WHERE id = ?`);
        const msg = getMsgStmt.get(messageId);
        if (msg && msg.sender_id === userId && msg.type === 'text') {
          const editStmt = db.prepare(`UPDATE messages SET content = ? WHERE id = ?`);
          editStmt.run(newContent, messageId);
          io.to(conversationId).emit('message_edited', { messageId, conversationId, content: newContent });
        }
      } catch (err) {
        console.error('Error editing message:', err);
      }
    });

    socket.on('join_conversation', ({ conversationId }) => {
      socket.join(conversationId);
    });

    // --- WebRTC Calling Events ---
    socket.on('call_user', ({ targetUserId, signalData, type }) => {
      io.to(targetUserId).emit('incoming_call', {
        from: userId,
        callerName: socket.user.display_name || socket.user.username,
        callerAvatar: socket.user.avatar_url,
        signalData,
        type // 'voice' or 'video'
      });
    });

    socket.on('accept_call', ({ targetUserId, signalData }) => {
      io.to(targetUserId).emit('call_accepted', {
        signalData
      });
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

    socket.on('create_group', ({ name, memberIds, groupId }) => {
       // Typically handled by REST, this event is to notify sockets
       memberIds.forEach(id => {
           // Not a direct way to force other sockets to join, but we can emit an event they listen to
           // or we emit to user-specific rooms. Let's assume each user is in a room named their userId.
           socket.join(userId); // Join own room on connect for direct notifications
       });
    });
    
    // Add user to their own room for direct notifications
    socket.join(userId);
  });
}

module.exports = setupSocketHandlers;
