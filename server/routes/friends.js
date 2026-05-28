/**
 * Friends Routes — Zynk
 * Handles sending, accepting, declining friend requests and listing friends.
 * When a request is accepted, a private conversation is automatically created.
 */
'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/friends
// Returns the current user's accepted friends list
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const db = req.app.get('db');
    const userId = req.user.id;

    const friends = db.prepare(`
      SELECT u.id, u.username, u.display_name, u.avatar_url, u.status_text, u.is_online, u.last_seen
      FROM friend_requests fr
      JOIN users u ON (
        CASE WHEN fr.sender_id = ? THEN fr.receiver_id ELSE fr.sender_id END = u.id
      )
      WHERE (fr.sender_id = ? OR fr.receiver_id = ?)
        AND fr.status = 'accepted'
      ORDER BY u.display_name ASC
    `).all(userId, userId, userId);

    return res.json({ friends });
  } catch (err) {
    console.error('[FRIENDS] List friends error:', err.message);
    return res.status(500).json({ error: 'Failed to list friends.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/friends/requests
// Returns all pending requests: incoming and outgoing
// ─────────────────────────────────────────────────────────────────────────────
router.get('/requests', (req, res) => {
  try {
    const db = req.app.get('db');
    const userId = req.user.id;

    // Incoming — others sent to me
    const incoming = db.prepare(`
      SELECT fr.id, fr.sender_id, fr.created_at,
             u.username, u.display_name, u.avatar_url, u.status_text, u.is_online
      FROM friend_requests fr
      JOIN users u ON u.id = fr.sender_id
      WHERE fr.receiver_id = ? AND fr.status = 'pending'
      ORDER BY fr.created_at DESC
    `).all(userId);

    // Outgoing — I sent to others
    const outgoing = db.prepare(`
      SELECT fr.id, fr.receiver_id, fr.created_at,
             u.username, u.display_name, u.avatar_url, u.status_text, u.is_online
      FROM friend_requests fr
      JOIN users u ON u.id = fr.receiver_id
      WHERE fr.sender_id = ? AND fr.status = 'pending'
      ORDER BY fr.created_at DESC
    `).all(userId);

    return res.json({ incoming, outgoing });
  } catch (err) {
    console.error('[FRIENDS] List requests error:', err.message);
    return res.status(500).json({ error: 'Failed to list requests.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/friends/request/:userId
// Send a friend request to another user
// ─────────────────────────────────────────────────────────────────────────────
router.post('/request/:userId', (req, res) => {
  try {
    const db = req.app.get('db');
    const senderId = req.user.id;
    const receiverId = req.params.userId;

    if (senderId === receiverId) {
      return res.status(400).json({ error: 'You cannot send a friend request to yourself.' });
    }

    // Check target user exists
    const target = db.prepare('SELECT id FROM users WHERE id = ?').get(receiverId);
    if (!target) return res.status(404).json({ error: 'User not found.' });

    // Check for existing request or friendship in any direction
    const existing = db.prepare(`
      SELECT id, status, sender_id FROM friend_requests
      WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
    `).get(senderId, receiverId, receiverId, senderId);

    if (existing) {
      if (existing.status === 'accepted') {
        return res.status(409).json({ error: 'You are already friends.' });
      }
      if (existing.status === 'pending' && existing.sender_id === senderId) {
        return res.status(409).json({ error: 'Friend request already sent.' });
      }
      // If they already sent a request to us, auto-accept
      if (existing.status === 'pending' && existing.sender_id === receiverId) {
        return acceptFriendship(db, existing.id, senderId, receiverId, res);
      }
      // Re-send declined
      db.prepare(`UPDATE friend_requests SET status = 'pending', sender_id = ?, receiver_id = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(senderId, receiverId, existing.id);
      const request = db.prepare('SELECT * FROM friend_requests WHERE id = ?').get(existing.id);
      return res.status(201).json({ request });
    }

    const id = uuidv4();
    db.prepare(`
      INSERT INTO friend_requests (id, sender_id, receiver_id, status)
      VALUES (?, ?, ?, 'pending')
    `).run(id, senderId, receiverId);

    const request = db.prepare(`
      SELECT fr.id, fr.sender_id, fr.receiver_id, fr.status, fr.created_at,
             u.username AS sender_username, u.display_name AS sender_display_name, u.avatar_url AS sender_avatar
      FROM friend_requests fr JOIN users u ON u.id = fr.sender_id
      WHERE fr.id = ?
    `).get(id);

    // Notify via socket (handled in handler.js using io)
    const io = req.app.get('io');
    if (io) {
      const senderInfo = db.prepare('SELECT id, username, display_name, avatar_url FROM users WHERE id = ?').get(senderId);
      io.to(receiverId).emit('friend_request_received', {
        requestId: id,
        sender: senderInfo
      });
    }

    console.log(`[FRIENDS] Request sent: ${senderId} → ${receiverId}`);
    return res.status(201).json({ request });
  } catch (err) {
    console.error('[FRIENDS] Send request error:', err.message);
    return res.status(500).json({ error: 'Failed to send friend request.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/friends/accept/:requestId
// Accept an incoming friend request
// ─────────────────────────────────────────────────────────────────────────────
router.post('/accept/:requestId', (req, res) => {
  try {
    const db = req.app.get('db');
    const userId = req.user.id;
    const { requestId } = req.params;

    const request = db.prepare(`
      SELECT * FROM friend_requests WHERE id = ? AND receiver_id = ? AND status = 'pending'
    `).get(requestId, userId);

    if (!request) {
      return res.status(404).json({ error: 'Friend request not found.' });
    }

    return acceptFriendship(db, requestId, userId, request.sender_id, res, req.app.get('io'));
  } catch (err) {
    console.error('[FRIENDS] Accept request error:', err.message);
    return res.status(500).json({ error: 'Failed to accept friend request.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/friends/decline/:requestId
// Decline an incoming request OR cancel an outgoing request
// ─────────────────────────────────────────────────────────────────────────────
router.post('/decline/:requestId', (req, res) => {
  try {
    const db = req.app.get('db');
    const userId = req.user.id;
    const { requestId } = req.params;

    const request = db.prepare(`
      SELECT * FROM friend_requests WHERE id = ?
        AND (receiver_id = ? OR sender_id = ?)
        AND status = 'pending'
    `).get(requestId, userId, userId);

    if (!request) {
      return res.status(404).json({ error: 'Friend request not found.' });
    }

    db.prepare(`UPDATE friend_requests SET status = 'declined' WHERE id = ?`).run(requestId);

    return res.json({ message: 'Request declined/cancelled.' });
  } catch (err) {
    console.error('[FRIENDS] Decline request error:', err.message);
    return res.status(500).json({ error: 'Failed to decline friend request.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/friends/:userId
// Remove a friend (deletes the friend_request record entirely)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:userId', (req, res) => {
  try {
    const db = req.app.get('db');
    const userId = req.user.id;
    const friendId = req.params.userId;

    db.prepare(`
      DELETE FROM friend_requests
      WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
        AND status = 'accepted'
    `).run(userId, friendId, friendId, userId);

    return res.json({ message: 'Friend removed.' });
  } catch (err) {
    console.error('[FRIENDS] Remove friend error:', err.message);
    return res.status(500).json({ error: 'Failed to remove friend.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Shared helper: accept a friendship + get/create private conversation
// ─────────────────────────────────────────────────────────────────────────────
function acceptFriendship(db, requestId, acceptorId, senderId, res, io) {
  db.prepare(`UPDATE friend_requests SET status = 'accepted' WHERE id = ?`).run(requestId);

  // Also add to contacts table (bidirectional)
  db.prepare('INSERT OR IGNORE INTO contacts (user_id, contact_id) VALUES (?, ?)').run(acceptorId, senderId);
  db.prepare('INSERT OR IGNORE INTO contacts (user_id, contact_id) VALUES (?, ?)').run(senderId, acceptorId);

  // Get or create private conversation between the two
  let existing = db.prepare(`
    SELECT c.id
    FROM conversations c
    JOIN conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = ?
    JOIN conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = ?
    WHERE c.type = 'private'
  `).get(acceptorId, senderId);

  let conversationId;
  if (!existing) {
    conversationId = uuidv4();
    db.exec('BEGIN');
    try {
      db.prepare(`INSERT INTO conversations (id, type, created_by) VALUES (?, 'private', ?)`).run(conversationId, acceptorId);
      db.prepare(`INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)`).run(conversationId, acceptorId);
      db.prepare(`INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)`).run(conversationId, senderId);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  } else {
    conversationId = existing.id;
  }

  // Build conversation object for acceptor (they see the sender as "otherUser")
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId);
  const senderUser = db.prepare('SELECT id, username, display_name, avatar_url, status_text, is_online, last_seen FROM users WHERE id = ?').get(senderId);
  const acceptorUser = db.prepare('SELECT id, username, display_name, avatar_url, status_text, is_online, last_seen FROM users WHERE id = ?').get(acceptorId);

  const convForAcceptor  = { ...conv, otherUser: senderUser,   unreadCount: 0 };
  const convForSender    = { ...conv, otherUser: acceptorUser, unreadCount: 0 };

  // Real-time notification to both parties
  if (io) {
    io.to(acceptorId).emit('friend_request_accepted', { conversationId, conversation: convForAcceptor, friendId: senderId });
    io.to(senderId).emit('friend_request_accepted',   { conversationId, conversation: convForSender,   friendId: acceptorId });

    // Also make both sockets join the new conversation room
    const acceptorSockets = [...(io.sockets.sockets.values())].filter(s => s.user?.id === acceptorId);
    const senderSockets   = [...(io.sockets.sockets.values())].filter(s => s.user?.id === senderId);
    acceptorSockets.forEach(s => s.join(conversationId));
    senderSockets.forEach(s => s.join(conversationId));
  }

  console.log(`[FRIENDS] Accepted: ${senderId} ↔ ${acceptorId}, conv: ${conversationId}`);
  return res.json({ conversation: convForAcceptor, friendId: senderId });
}

module.exports = router;
