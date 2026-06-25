'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All search routes are protected
router.use(authenticate);

/**
 * GET /
 * Global search for messages and users.
 * Query Params:
 * - q: text query
 * - filter: 'image', 'video', 'audio', 'document', 'link', 'all'
 * - date: 'YYYY-MM-DD' optional
 */
router.get('/', (req, res) => {
  try {
    const db = req.app.get('db');
    const userId = req.user.id;
    const { q, filter, date } = req.query;

    const queryStr = q ? String(q).trim() : '';
    const activeFilter = filter || 'all';
    const dateStr = date ? String(date).trim() : null;

    if (!queryStr && activeFilter === 'all' && !dateStr) {
      return res.json({ users: [], messages: [] });
    }

    const results = { users: [], messages: [] };

    // Search Users (if not filtering for media)
    if (activeFilter === 'all' && queryStr.length > 0) {
      const searchUsers = db.prepare(`
        SELECT id, username, display_name, avatar_url
        FROM users
        WHERE (username LIKE ? OR display_name LIKE ?) AND id != 'system'
        LIMIT 10
      `).all(`%${queryStr}%`, `%${queryStr}%`);
      results.users = searchUsers;
    }

    // Search Messages
    // Base query logic: we only search messages in conversations the user is a part of
    let sql = `
      SELECT m.id, m.conversation_id, m.sender_id, m.content, m.type,
             m.file_url, m.file_name, m.file_size, m.created_at,
             u.username AS sender_username, u.display_name AS sender_display_name, u.avatar_url AS sender_avatar,
             c.name AS conversation_name, c.type AS conversation_type, c.avatar_url AS conversation_avatar,
             (SELECT cm2.user_id FROM conversation_members cm2 WHERE cm2.conversation_id = c.id AND cm2.user_id != ? LIMIT 1) AS other_user_id
      FROM messages m
      JOIN conversation_members cm ON cm.conversation_id = m.conversation_id
      JOIN conversations c ON c.id = m.conversation_id
      JOIN users u ON u.id = m.sender_id
      WHERE cm.user_id = ? AND m.is_deleted = 0
    `;
    const params = [userId, userId];

    // 1. Text Query
    if (queryStr) {
      sql += ` AND (m.content LIKE ? OR m.file_name LIKE ?)`;
      params.push(`%${queryStr}%`, `%${queryStr}%`);
    }

    // 2. Type Filter
    if (activeFilter === 'image') {
      sql += ` AND m.type = 'image'`;
    } else if (activeFilter === 'video') {
      sql += ` AND m.type = 'video'`;
    } else if (activeFilter === 'audio') {
      sql += ` AND m.type = 'audio'`;
    } else if (activeFilter === 'document') {
      sql += ` AND m.type IN ('document', 'file')`;
    } else if (activeFilter === 'link') {
      sql += ` AND (m.content LIKE '%http://%' OR m.content LIKE '%https://%')`;
    }

    // 3. Date Filter
    if (dateStr) {
      sql += ` AND m.created_at LIKE ?`;
      params.push(`${dateStr}%`);
    }

    sql += ` ORDER BY m.created_at DESC LIMIT 50`;

    const searchMessages = db.prepare(sql).all(...params);

    // Format results to fetch other user info for private chats
    const formattedMessages = searchMessages.map(m => {
      let convName = m.conversation_name;
      let convAvatar = m.conversation_avatar;

      if (m.conversation_type === 'private') {
        const otherUserId = m.other_user_id || m.sender_id; // fallback
        const otherUser = db.prepare('SELECT display_name, username, avatar_url FROM users WHERE id = ?').get(otherUserId);
        if (otherUser) {
          convName = otherUser.display_name || otherUser.username;
          convAvatar = otherUser.avatar_url;
        } else {
          // Self chat
          const selfUser = db.prepare('SELECT display_name, username, avatar_url FROM users WHERE id = ?').get(userId);
          convName = 'You (Message yourself)';
          convAvatar = selfUser ? selfUser.avatar_url : null;
        }
      }

      return {
        id: m.id,
        conversation_id: m.conversation_id,
        content: m.content,
        type: m.type,
        file_url: m.file_url,
        file_name: m.file_name,
        created_at: m.created_at,
        sender: {
          id: m.sender_id,
          username: m.sender_username,
          display_name: m.sender_display_name,
          avatar_url: m.sender_avatar
        },
        conversation: {
          id: m.conversation_id,
          type: m.conversation_type,
          name: convName,
          avatar_url: convAvatar
        }
      };
    });

    results.messages = formattedMessages;

    return res.json(results);
  } catch (err) {
    console.error('[SEARCH] Global search error:', err.message);
    return res.status(500).json({ error: 'Internal server error during search.' });
  }
});

module.exports = router;
