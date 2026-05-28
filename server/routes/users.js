/**
 * User Routes — Zynk
 * 
 * Handles user search, contacts management, and profile updates.
 * All routes in this module require authentication.
 * 
 * GET    /search      — search users by username, display_name, or phone
 * GET    /contacts    — list the current user's contacts
 * POST   /contacts/:id — add a contact (bidirectional)
 * DELETE /contacts/:id — remove a contact (bidirectional)
 * GET    /:id         — get a user profile by ID
 * PUT    /profile     — update current user's profile
 */

'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All user routes are protected
router.use(authenticate);

/**
 * GET /search?q=<query>
 * Searches users by username or display_name. Excludes the current user.
 * Case-insensitive. Handles NULL display_name gracefully.
 * Returns up to 30 results.
 */
router.get('/search', (req, res) => {
  try {
    const db = req.app.get('db');
    const { q } = req.query;

    if (!q || q.trim().length === 0) {
      return res.json({ users: [] });
    }

    // LOWER() ensures case-insensitive match even for Unicode
    // COALESCE handles NULL display_name fields safely
    const searchTerm = `%${q.trim().toLowerCase()}%`;

    const users = db.prepare(`
      SELECT id, username, phone, display_name, avatar_url, status_text, is_online, last_seen
      FROM users
      WHERE id != ?
        AND (
          LOWER(username) LIKE ?
          OR LOWER(COALESCE(display_name, '')) LIKE ?
          OR phone LIKE ?
        )
      ORDER BY
        CASE WHEN LOWER(COALESCE(display_name, username)) LIKE ? THEN 0 ELSE 1 END,
        display_name ASC
      LIMIT 30
    `).all(req.user.id, searchTerm, searchTerm, searchTerm, searchTerm);

    return res.json({ users });
  } catch (err) {
    console.error('[USERS] Search error:', err.message);
    return res.status(500).json({ error: 'Internal server error during search.' });
  }
});


/**
 * GET /contacts
 * Returns the current user's contacts with their online status and last_seen.
 */
router.get('/contacts', (req, res) => {
  try {
    const db = req.app.get('db');

    const contacts = db.prepare(`
      SELECT u.id, u.username, u.phone, u.display_name, u.avatar_url,
             u.status_text, u.is_online, u.last_seen
      FROM contacts c
      JOIN users u ON u.id = c.contact_id
      WHERE c.user_id = ?
      ORDER BY u.display_name ASC
    `).all(req.user.id);

    return res.json({ contacts });
  } catch (err) {
    console.error('[USERS] Get contacts error:', err.message);
    return res.status(500).json({ error: 'Internal server error fetching contacts.' });
  }
});

/**
 * POST /contacts/:id
 * Adds a bidirectional contact relationship between the current user and the
 * target user. Both directions are inserted so either party can see the other.
 */
router.post('/contacts/:id', (req, res) => {
  try {
    const db = req.app.get('db');
    const contactId = req.params.id;

    // Prevent self-add
    if (contactId === req.user.id) {
      return res.status(400).json({ error: 'You cannot add yourself as a contact.' });
    }

    // Make sure the target user exists
    const contactUser = db.prepare('SELECT id FROM users WHERE id = ?').get(contactId);
    if (!contactUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Check if already a contact
    const existing = db.prepare(
      'SELECT 1 FROM contacts WHERE user_id = ? AND contact_id = ?'
    ).get(req.user.id, contactId);

    if (existing) {
      return res.status(409).json({ error: 'User is already in your contacts.' });
    }

    // Insert both directions in a transaction
    const addContact = db.transaction(() => {
      db.prepare('INSERT INTO contacts (user_id, contact_id) VALUES (?, ?)').run(req.user.id, contactId);
      db.prepare('INSERT OR IGNORE INTO contacts (user_id, contact_id) VALUES (?, ?)').run(contactId, req.user.id);
    });
    addContact();

    // Return the newly added contact's info
    const user = db.prepare(`
      SELECT id, username, phone, display_name, avatar_url, status_text, is_online, last_seen
      FROM users WHERE id = ?
    `).get(contactId);

    console.log(`[USERS] Contact added: ${req.user.id} ↔ ${contactId}`);

    return res.status(201).json({ contact: user });
  } catch (err) {
    console.error('[USERS] Add contact error:', err.message);
    return res.status(500).json({ error: 'Internal server error adding contact.' });
  }
});

/**
 * DELETE /contacts/:id
 * Removes a bidirectional contact relationship.
 */
router.delete('/contacts/:id', (req, res) => {
  try {
    const db = req.app.get('db');
    const contactId = req.params.id;

    // Remove both directions
    const removeContact = db.transaction(() => {
      db.prepare('DELETE FROM contacts WHERE user_id = ? AND contact_id = ?').run(req.user.id, contactId);
      db.prepare('DELETE FROM contacts WHERE user_id = ? AND contact_id = ?').run(contactId, req.user.id);
    });
    removeContact();

    console.log(`[USERS] Contact removed: ${req.user.id} ↔ ${contactId}`);

    return res.json({ message: 'Contact removed successfully.' });
  } catch (err) {
    console.error('[USERS] Remove contact error:', err.message);
    return res.status(500).json({ error: 'Internal server error removing contact.' });
  }
});

/**
 * GET /:id
 * Returns a public user profile by ID.
 */
router.get('/:id', (req, res) => {
  try {
    const db = req.app.get('db');

    const user = db.prepare(`
      SELECT id, username, phone, display_name, avatar_url, status_text, is_online, last_seen, created_at
      FROM users WHERE id = ?
    `).get(req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.json({ user });
  } catch (err) {
    console.error('[USERS] Get user error:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * PUT /profile
 * Updates the current user's display_name, status_text, and/or avatar_url.
 * Only provided fields are updated.
 */
router.put('/profile', (req, res) => {
  try {
    const db = req.app.get('db');
    const { display_name, status_text, avatar_url } = req.body;

    // Build dynamic update — only set fields that were provided
    const updates = [];
    const params = [];

    if (display_name !== undefined) {
      updates.push('display_name = ?');
      params.push(display_name);
    }
    if (status_text !== undefined) {
      updates.push('status_text = ?');
      params.push(status_text);
    }
    if (avatar_url !== undefined) {
      updates.push('avatar_url = ?');
      params.push(avatar_url);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    params.push(req.user.id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    // Fetch and return the updated profile
    const user = db.prepare(`
      SELECT id, username, phone, display_name, avatar_url, status_text, is_online, last_seen, created_at
      FROM users WHERE id = ?
    `).get(req.user.id);

    console.log(`[USERS] Profile updated for ${req.user.id}`);

    return res.json({ user });
  } catch (err) {
    console.error('[USERS] Update profile error:', err.message);
    return res.status(500).json({ error: 'Internal server error updating profile.' });
  }
});

module.exports = router;
