/**
 * Message Routes — Zynk
 * 
 * Handles conversation listing, message retrieval, message deletion,
 * and private conversation creation.
 * All routes require authentication.
 * 
 * GET  /conversations                — list user's conversations
 * GET  /:conversationId              — paginated messages in a conversation
 * DELETE /:id                        — soft-delete a message (sender only)
 * POST /conversations/private/:userId — get or create a private conversation
 */

'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All message routes are protected
router.use(authenticate);

/**
 * GET /conversations
 * Lists all conversations the current user belongs to, with:
 *  - Last message preview
 *  - Other user info (for private chats)
 *  - Unread message count
 *  - Sorted by most recent message
 */
router.get('/conversations', (req, res) => {
  try {
    const db = req.app.get('db');
    const userId = req.user.id;

    // Get all conversations the user is a member of
    const conversations = db.prepare(`
      SELECT c.id, c.type, c.name, c.avatar_url, c.created_by, c.created_at
      FROM conversations c
      JOIN conversation_members cm ON cm.conversation_id = c.id
      WHERE cm.user_id = ?
    `).all(userId);

    const result = conversations.map((conv) => {
      // Get the last message in this conversation
      const lastMessage = db.prepare(`
        SELECT m.id, m.sender_id, m.content, m.type, m.file_name, m.is_deleted, m.created_at,
               u.username AS sender_username, u.display_name AS sender_display_name,
               CASE
                 WHEN (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = m.conversation_id AND user_id != m.sender_id) = 0 THEN 'read'
                 WHEN (SELECT COUNT(*) FROM message_reads WHERE message_id = m.id AND user_id != m.sender_id) >= (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = m.conversation_id AND user_id != m.sender_id) THEN 'read'
                 WHEN (SELECT COUNT(*) FROM message_deliveries WHERE message_id = m.id AND user_id != m.sender_id) >= (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = m.conversation_id AND user_id != m.sender_id) THEN 'delivered'
                 ELSE 'sent'
               END AS status
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        WHERE m.conversation_id = ?
        ORDER BY m.created_at DESC
        LIMIT 1
      `).get(conv.id);

      // Count unread messages (messages not read by this user, excluding own)
      const unreadCount = db.prepare(`
        SELECT COUNT(*) AS count
        FROM messages m
        WHERE m.conversation_id = ?
          AND m.sender_id != ?
          AND m.is_deleted = 0
          AND m.id NOT IN (
            SELECT mr.message_id FROM message_reads mr WHERE mr.user_id = ?
          )
      `).get(conv.id, userId, userId);

      // For private chats, include the other user's info
      let otherUser = null;
      if (conv.type === 'private') {
        otherUser = db.prepare(`
          SELECT u.id, u.username, u.display_name, u.avatar_url, u.is_online, u.last_seen, u.status_text
          FROM conversation_members cm
          JOIN users u ON u.id = cm.user_id
          WHERE cm.conversation_id = ? AND cm.user_id != ?
        `).get(conv.id, userId);

        if (!otherUser) {
          // Self chat: the only member is the user themselves
          otherUser = db.prepare(`
            SELECT id, username, display_name, avatar_url, is_online, last_seen, status_text
            FROM users WHERE id = ?
          `).get(userId);
          if (otherUser) {
            otherUser.is_self = true;
          }
        }
      }

      // For group chats, get member count + member list (for header display)
      let memberCount = 0;
      let members = [];
      if (conv.type === 'group') {
        const memberRows = db.prepare(`
          SELECT u.id, u.display_name, u.username, u.avatar_url, u.is_online
          FROM conversation_members cm
          JOIN users u ON u.id = cm.user_id
          WHERE cm.conversation_id = ? AND u.id != 'system'
          ORDER BY cm.role DESC, u.display_name ASC
        `).all(conv.id);
        members = memberRows;
        memberCount = memberRows.length;
      }

      let formattedLastMessage = null;
      if (lastMessage) {
        formattedLastMessage = {
          id: lastMessage.id,
          sender_id: lastMessage.sender_id,
          content: lastMessage.content,
          type: lastMessage.type,
          file_name: lastMessage.file_name,
          is_deleted: lastMessage.is_deleted,
          created_at: lastMessage.created_at,
          status: lastMessage.status,
          sender: {
            id: lastMessage.sender_id,
            username: lastMessage.sender_username,
            display_name: lastMessage.sender_display_name
          }
        };
      }

      return {
        ...conv,
        lastMessage: formattedLastMessage,
        unreadCount: unreadCount ? unreadCount.count : 0,
        otherUser,
        memberCount,
        members,
      };
    });

    // Sort by last message time (most recent first), conversations with no messages go last
    result.sort((a, b) => {
      const timeA = a.lastMessage ? new Date(a.lastMessage.created_at).getTime() : 0;
      const timeB = b.lastMessage ? new Date(b.lastMessage.created_at).getTime() : 0;
      return timeB - timeA;
    });

    return res.json({ conversations: result });
  } catch (err) {
    console.error('[MESSAGES] List conversations error:', err.message);
    return res.status(500).json({ error: 'Internal server error listing conversations.' });
  }
});

/**
 * GET /:conversationId
 * Returns paginated messages for a conversation.
 * Query: ?offset=0  (defaults to 0, returns 50 messages per page)
 */
router.get('/:conversationId', (req, res) => {
  try {
    const db = req.app.get('db');
    const { conversationId } = req.params;
    const offset = parseInt(req.query.offset, 10) || 0;
    const limit = 50;

    // Verify the user is a member of this conversation
    const membership = db.prepare(
      'SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?'
    ).get(conversationId, req.user.id);

    if (!membership) {
      return res.status(403).json({ error: 'You are not a member of this conversation.' });
    }

    // Fetch messages with sender info, newest first
    const messages = db.prepare(`
      SELECT m.id, m.conversation_id, m.sender_id, m.content, m.type,
             m.file_url, m.file_name, m.file_size, m.is_deleted, m.created_at,
             u.username AS sender_username, u.display_name AS sender_display_name,
             u.avatar_url AS sender_avatar,
             CASE
               WHEN (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = m.conversation_id AND user_id != m.sender_id) = 0 THEN 'read'
               WHEN (SELECT COUNT(*) FROM message_reads WHERE message_id = m.id AND user_id != m.sender_id) >= (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = m.conversation_id AND user_id != m.sender_id) THEN 'read'
               WHEN (SELECT COUNT(*) FROM message_deliveries WHERE message_id = m.id AND user_id != m.sender_id) >= (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = m.conversation_id AND user_id != m.sender_id) THEN 'delivered'
               ELSE 'sent'
             END AS status
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = ?
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?
    `).all(conversationId, limit, offset);

    // Format messages to nest sender info
    const formattedMessages = messages.map(m => ({
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
      status: m.status,
      sender: {
        id: m.sender_id,
        username: m.sender_username,
        display_name: m.sender_display_name,
        avatar_url: m.sender_avatar
      }
    }));

    // Get total message count for pagination info
    const total = db.prepare(
      'SELECT COUNT(*) AS count FROM messages WHERE conversation_id = ?'
    ).get(conversationId);

    return res.json({
      messages: formattedMessages.reverse(), // Return in chronological order
      total: total.count,
      offset,
      limit,
      hasMore: offset + limit < total.count,
    });
  } catch (err) {
    console.error('[MESSAGES] Get messages error:', err.message);
    return res.status(500).json({ error: 'Internal server error fetching messages.' });
  }
});

/**
 * DELETE /:id
 * Soft-deletes a message by setting is_deleted = 1.
 * Only the original sender can delete their own messages.
 */
router.delete('/:id', (req, res) => {
  try {
    const db = req.app.get('db');
    const messageId = req.params.id;

    // Look up the message
    const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);

    if (!message) {
      return res.status(404).json({ error: 'Message not found.' });
    }

    // Only the sender can delete
    if (message.sender_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own messages.' });
    }

    // Already deleted?
    if (message.is_deleted) {
      return res.status(400).json({ error: 'Message is already deleted.' });
    }

    db.prepare('UPDATE messages SET is_deleted = 1 WHERE id = ?').run(messageId);

    console.log(`[MESSAGES] Message deleted: ${messageId} by ${req.user.id}`);

    return res.json({ message: 'Message deleted successfully.', messageId });
  } catch (err) {
    console.error('[MESSAGES] Delete message error:', err.message);
    return res.status(500).json({ error: 'Internal server error deleting message.' });
  }
});

/**
 * POST /conversations/private/:userId
 * Gets an existing private conversation with the target user, or creates one
 * if it doesn't exist. Returns the conversation object.
 */
router.post('/conversations/private/:userId', (req, res) => {
  try {
    const db = req.app.get('db');
    const targetUserId = req.params.userId;
    const currentUserId = req.user.id;

    // Verify the target user exists
    const targetUser = db.prepare('SELECT id FROM users WHERE id = ?').get(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Check if a private conversation already exists between these two users
    let existing;
    if (targetUserId === currentUserId) {
      existing = db.prepare(`
        SELECT cm.conversation_id AS id
        FROM conversation_members cm
        JOIN conversations c ON c.id = cm.conversation_id
        WHERE c.type = 'private'
        GROUP BY cm.conversation_id
        HAVING COUNT(cm.user_id) = 1 AND MAX(cm.user_id) = ?
      `).get(currentUserId);
    } else {
      existing = db.prepare(`
        SELECT c.id
        FROM conversations c
        JOIN conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = ?
        JOIN conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = ?
        WHERE c.type = 'private'
      `).get(currentUserId, targetUserId);
    }

    if (existing) {
      // Return the existing conversation with other user info
      const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(existing.id);
      const otherUser = db.prepare(`
        SELECT id, username, display_name, avatar_url, is_online, last_seen, status_text
        FROM users WHERE id = ?
      `).get(targetUserId);

      if (otherUser && targetUserId === currentUserId) {
        otherUser.is_self = true;
      }

      return res.json({ conversation: { ...conv, otherUser }, created: false });
    }

    // Create a new private conversation
    const conversationId = uuidv4();

    db.exec('BEGIN');
    try {
      db.prepare(`
        INSERT INTO conversations (id, type, created_by)
        VALUES (?, 'private', ?)
      `).run(conversationId, currentUserId);

      db.prepare(`
        INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)
      `).run(conversationId, currentUserId);

      if (targetUserId !== currentUserId) {
        db.prepare(`
          INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)
        `).run(conversationId, targetUserId);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId);
    const otherUser = db.prepare(`
      SELECT id, username, display_name, avatar_url, is_online, last_seen, status_text
      FROM users WHERE id = ?
    `).get(targetUserId);

    if (otherUser && targetUserId === currentUserId) {
      otherUser.is_self = true;
    }

    console.log(`[MESSAGES] Private conversation created: ${conversationId} (${currentUserId} ↔ ${targetUserId})`);

    return res.status(201).json({ conversation: { ...conv, otherUser }, created: true });
  } catch (err) {
    console.error('[MESSAGES] Create private conversation error:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /delivered-silent
 * Allows service worker or background tasks to acknowledge message delivery.
 */
router.post('/delivered-silent', (req, res) => {
  try {
    const db = req.app.get('db');
    const userId = req.user.id;
    const { messageId, conversationId } = req.body;

    if (!messageId || !conversationId) {
      return res.status(400).json({ error: 'Missing messageId or conversationId' });
    }

    // Insert delivery receipt in DB
    db.prepare(`INSERT OR IGNORE INTO message_deliveries (message_id, user_id) VALUES (?, ?)`).run(messageId, userId);

    // Emit socket event to notify online sender/others in real-time
    const io = req.app.get('io');
    if (io) {
      io.to(conversationId).emit('message_delivered', { messageId, conversationId, userId });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[MESSAGES] delivered-silent error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

