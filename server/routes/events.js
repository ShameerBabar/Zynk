'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All event routes require authentication
router.use(authenticate);

// Helper: verify user is member of conversation
function assertMember(db, conversationId, userId, res) {
  const row = db.prepare(
    'SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?'
  ).get(conversationId, userId);
  if (!row) {
    res.status(403).json({ error: 'Not a member of this conversation.' });
    return false;
  }
  return true;
}

// Helper: fetch full event with RSVPs
function getFullEvent(db, eventId) {
  const event = db.prepare(`
    SELECT e.*, u.display_name AS creator_display_name, u.username AS creator_username, u.avatar_url AS creator_avatar
    FROM events e
    JOIN users u ON u.id = e.creator_id
    WHERE e.id = ?
  `).get(eventId);
  if (!event) return null;

  const rsvps = db.prepare(`
    SELECT er.user_id, er.status, er.updated_at,
           u.display_name, u.username, u.avatar_url
    FROM event_rsvps er
    JOIN users u ON u.id = er.user_id
    WHERE er.event_id = ?
  `).all(eventId);

  return { ...event, rsvps };
}

/**
 * POST /events
 * Create a new event.
 * Body: { conversationId, messageId?, title, eventDate?, eventTime?, location?, notes? }
 */
router.post('/', (req, res) => {
  try {
    const db = req.app.get('db');
    const io = req.app.get('io');
    const userId = req.user.id;
    const { conversationId, messageId, title, eventDate, eventTime, location, notes } = req.body;

    if (!conversationId || !title) {
      return res.status(400).json({ error: 'conversationId and title are required.' });
    }

    if (!assertMember(db, conversationId, userId, res)) return;

    const eventId = uuidv4();

    db.prepare(`
      INSERT INTO events (id, conversation_id, message_id, creator_id, title, event_date, event_time, location, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(eventId, conversationId, messageId || null, userId, title, eventDate || null, eventTime || null, location || null, notes || null);

    const full = getFullEvent(db, eventId);

    // Broadcast so all open ChatWindows update their eventsMap
    io.to(conversationId).emit('event_created', full);

    return res.json({ success: true, event: full });
  } catch (err) {
    console.error('[EVENTS] Error creating event:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * GET /events?conversationId=...
 * List all events for a conversation.
 */
router.get('/', (req, res) => {
  try {
    const db = req.app.get('db');
    const userId = req.user.id;
    const { conversationId } = req.query;

    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId query param required.' });
    }

    if (!assertMember(db, conversationId, userId, res)) return;

    const events = db.prepare(`
      SELECT e.*, u.display_name AS creator_display_name, u.username AS creator_username, u.avatar_url AS creator_avatar
      FROM events e
      JOIN users u ON u.id = e.creator_id
      WHERE e.conversation_id = ?
      ORDER BY e.event_date ASC, e.event_time ASC
    `).all(conversationId);

    // Attach RSVPs to each event
    const full = events.map(ev => {
      const rsvps = db.prepare(`
        SELECT er.user_id, er.status, er.updated_at,
               u.display_name, u.username, u.avatar_url
        FROM event_rsvps er
        JOIN users u ON u.id = er.user_id
        WHERE er.event_id = ?
      `).all(ev.id);
      return { ...ev, rsvps };
    });

    return res.json({ events: full });
  } catch (err) {
    console.error('[EVENTS] Error listing events:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * GET /events/upcoming
 * Events in the next 48 hours, across all conversations the user belongs to.
 */
router.get('/upcoming', (req, res) => {
  try {
    const db = req.app.get('db');
    const userId = req.user.id;

    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const nowStr = now.toISOString().slice(0, 10);
    const futureStr = in48h.toISOString().slice(0, 10);

    const events = db.prepare(`
      SELECT e.*, u.display_name AS creator_display_name, u.username AS creator_username
      FROM events e
      JOIN users u ON u.id = e.creator_id
      JOIN conversation_members cm ON cm.conversation_id = e.conversation_id AND cm.user_id = ?
      WHERE e.event_date IS NOT NULL
        AND e.event_date >= ?
        AND e.event_date <= ?
      ORDER BY e.event_date ASC, e.event_time ASC
    `).all(userId, nowStr, futureStr);

    return res.json({ events });
  } catch (err) {
    console.error('[EVENTS] Error fetching upcoming events:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * GET /events/:id
 * Get a single event with RSVPs.
 */
router.get('/:id', (req, res) => {
  try {
    const db = req.app.get('db');
    const userId = req.user.id;
    const { id } = req.params;

    const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
    if (!ev) return res.status(404).json({ error: 'Event not found.' });

    if (!assertMember(db, ev.conversation_id, userId, res)) return;

    const full = getFullEvent(db, id);
    return res.json({ event: full });
  } catch (err) {
    console.error('[EVENTS] Error getting event:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * PUT /events/:id
 * Update event details (creator only).
 * Body: { title?, eventDate?, eventTime?, location?, notes? }
 */
router.put('/:id', (req, res) => {
  try {
    const db = req.app.get('db');
    const io = req.app.get('io');
    const userId = req.user.id;
    const { id } = req.params;
    const { title, eventDate, eventTime, location, notes } = req.body;

    const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
    if (!ev) return res.status(404).json({ error: 'Event not found.' });
    if (ev.creator_id !== userId) return res.status(403).json({ error: 'Only the creator can edit this event.' });

    db.prepare(`
      UPDATE events
      SET title = ?, event_date = ?, event_time = ?, location = ?, notes = ?
      WHERE id = ?
    `).run(
      title ?? ev.title,
      eventDate !== undefined ? eventDate : ev.event_date,
      eventTime !== undefined ? eventTime : ev.event_time,
      location !== undefined ? location : ev.location,
      notes !== undefined ? notes : ev.notes,
      id
    );

    const full = getFullEvent(db, id);
    io.to(ev.conversation_id).emit('event_updated', full);

    return res.json({ success: true, event: full });
  } catch (err) {
    console.error('[EVENTS] Error updating event:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * DELETE /events/:id
 * Delete event (creator only).
 */
router.delete('/:id', (req, res) => {
  try {
    const db = req.app.get('db');
    const io = req.app.get('io');
    const userId = req.user.id;
    const { id } = req.params;

    const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
    if (!ev) return res.status(404).json({ error: 'Event not found.' });
    if (ev.creator_id !== userId) return res.status(403).json({ error: 'Only the creator can delete this event.' });

    db.prepare('DELETE FROM events WHERE id = ?').run(id);
    io.to(ev.conversation_id).emit('event_deleted', { eventId: id, conversationId: ev.conversation_id });

    return res.json({ success: true });
  } catch (err) {
    console.error('[EVENTS] Error deleting event:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /events/:id/rsvp
 * Set RSVP status for current user.
 * Body: { status: 'going' | 'maybe' | 'not_going' }
 */
router.post('/:id/rsvp', (req, res) => {
  try {
    const db = req.app.get('db');
    const io = req.app.get('io');
    const userId = req.user.id;
    const { id } = req.params;
    const { status } = req.body;

    if (!['going', 'maybe', 'not_going'].includes(status)) {
      return res.status(400).json({ error: 'status must be going, maybe, or not_going.' });
    }

    const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
    if (!ev) return res.status(404).json({ error: 'Event not found.' });

    if (!assertMember(db, ev.conversation_id, userId, res)) return;

    db.prepare(`
      INSERT INTO event_rsvps (event_id, user_id, status)
      VALUES (?, ?, ?)
      ON CONFLICT(event_id, user_id) DO UPDATE SET status = excluded.status, updated_at = CURRENT_TIMESTAMP
    `).run(id, userId, status);

    const full = getFullEvent(db, id);
    io.to(ev.conversation_id).emit('event_rsvp_updated', full);

    return res.json({ success: true, event: full });
  } catch (err) {
    console.error('[EVENTS] Error setting RSVP:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
