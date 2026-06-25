'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All poll routes require authentication
router.use(authenticate);

/**
 * POST /polls
 * Creates a new poll message in a conversation.
 * Body: { conversationId, question, options: string[], allowMultiple: boolean, isAnonymous: boolean, allowChange: boolean, expiresInMs?: number }
 */
router.post('/', (req, res) => {
  try {
    const db = req.app.get('db');
    const io = req.app.get('io');
    const userId = req.user.id;
    const { conversationId, question, options, allowMultiple, isAnonymous, allowChange, expiresInMs } = req.body;

    if (!conversationId || !question || !options || options.length < 2) {
      return res.status(400).json({ error: 'Missing required fields or insufficient options.' });
    }

    // Verify membership
    const isMember = db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(conversationId, userId);
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this conversation.' });
    }

    const messageId = uuidv4();
    const pollId = uuidv4();
    const expiresAt = expiresInMs ? new Date(Date.now() + expiresInMs).toISOString() : null;

    db.exec('BEGIN');
    try {
      // 1. Create message
      db.prepare(`
        INSERT INTO messages (id, conversation_id, sender_id, type)
        VALUES (?, ?, ?, 'poll')
      `).run(messageId, conversationId, userId);

      // 2. Create poll
      db.prepare(`
        INSERT INTO polls (id, message_id, question, allow_multiple, is_anonymous, allow_change, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        pollId, messageId, question,
        allowMultiple ? 1 : 0,
        isAnonymous ? 1 : 0,
        allowChange ? 1 : 0,
        expiresAt
      );

      // 3. Create options
      const insertOption = db.prepare('INSERT INTO poll_options (id, poll_id, text, position) VALUES (?, ?, ?, ?)');
      options.forEach((optText, index) => {
        insertOption.run(uuidv4(), pollId, optText, index);
      });

      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }

    // Retrieve full message to broadcast
    const message = db.prepare(`
      SELECT m.id, m.conversation_id, m.sender_id, m.content, m.type, m.is_deleted, m.created_at,
             u.username AS sender_username, u.display_name AS sender_display_name, u.avatar_url AS sender_avatar
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.id = ?
    `).get(messageId);

    const fullPoll = db.prepare('SELECT * FROM polls WHERE id = ?').get(pollId);
    const fullOptions = db.prepare('SELECT * FROM poll_options WHERE poll_id = ? ORDER BY position ASC').all(pollId);

    const payload = {
      ...message,
      status: 'sent',
      sender: {
        id: message.sender_id,
        username: message.sender_username,
        display_name: message.sender_display_name,
        avatar_url: message.sender_avatar
      },
      poll: {
        ...fullPoll,
        options: fullOptions,
        votes: [] // initially empty
      }
    };

    io.to(conversationId).emit('new_message', payload);
    return res.json({ success: true, message: payload });
  } catch (err) {
    console.error('[POLLS] Error creating poll:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /polls/:pollId/vote
 * Casts or toggles a vote.
 * Body: { optionIds: string[] }
 */
router.post('/:pollId/vote', (req, res) => {
  try {
    const db = req.app.get('db');
    const io = req.app.get('io');
    const userId = req.user.id;
    const { pollId } = req.params;
    let { optionIds } = req.body;

    if (!Array.isArray(optionIds)) {
      optionIds = [optionIds];
    }

    const poll = db.prepare(`
      SELECT p.*, m.conversation_id 
      FROM polls p
      JOIN messages m ON m.id = p.message_id
      WHERE p.id = ?
    `).get(pollId);

    if (!poll) return res.status(404).json({ error: 'Poll not found.' });

    // Verify membership
    const isMember = db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(poll.conversation_id, userId);
    if (!isMember) return res.status(403).json({ error: 'Not a member of this conversation.' });

    if (poll.is_closed === 1) return res.status(400).json({ error: 'Poll is closed.' });
    if (poll.expires_at && new Date(poll.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Poll has expired.' });
    }

    const existingVotes = db.prepare('SELECT option_id FROM poll_votes WHERE poll_id = ? AND user_id = ?').all(pollId, userId).map(v => v.option_id);

    if (existingVotes.length > 0 && poll.allow_change === 0) {
      return res.status(400).json({ error: 'Cannot change vote on this poll.' });
    }

    if (poll.allow_multiple === 0 && optionIds.length > 1) {
      return res.status(400).json({ error: 'Multiple votes not allowed.' });
    }

    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ?').run(pollId, userId);
      
      const insertVote = db.prepare('INSERT INTO poll_votes (poll_id, option_id, user_id) VALUES (?, ?, ?)');
      optionIds.forEach(optId => {
        // Only insert if it's a valid option
        const isValid = db.prepare('SELECT 1 FROM poll_options WHERE id = ? AND poll_id = ?').get(optId, pollId);
        if (isValid) insertVote.run(pollId, optId, userId);
      });
      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }

    // Fetch updated votes for this poll
    const allVotes = db.prepare(`
      SELECT pv.option_id, pv.user_id, u.display_name, u.username
      FROM poll_votes pv
      JOIN users u ON u.id = pv.user_id
      WHERE pv.poll_id = ?
    `).all(pollId);

    // Format votes respecting anonymity
    const formattedVotes = allVotes.map(v => {
      if (poll.is_anonymous === 1) {
        return { option_id: v.option_id }; // Return count only functionally
      }
      return v;
    });

    // Broadcast update
    io.to(poll.conversation_id).emit('poll_updated', {
      messageId: poll.message_id,
      pollId: pollId,
      votes: formattedVotes
    });

    return res.json({ success: true, votes: formattedVotes });
  } catch (err) {
    console.error('[POLLS] Error voting:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * PUT /polls/:pollId/close
 * Close a poll manually (creator only).
 */
router.put('/:pollId/close', (req, res) => {
  try {
    const db = req.app.get('db');
    const io = req.app.get('io');
    const userId = req.user.id;
    const { pollId } = req.params;

    const poll = db.prepare(`
      SELECT p.*, m.sender_id, m.conversation_id 
      FROM polls p
      JOIN messages m ON m.id = p.message_id
      WHERE p.id = ?
    `).get(pollId);

    if (!poll) return res.status(404).json({ error: 'Poll not found.' });
    if (poll.sender_id !== userId) return res.status(403).json({ error: 'Only the creator can close this poll.' });

    db.prepare('UPDATE polls SET is_closed = 1 WHERE id = ?').run(pollId);

    io.to(poll.conversation_id).emit('poll_updated', {
      messageId: poll.message_id,
      pollId: pollId,
      is_closed: 1
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('[POLLS] Error closing poll:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
