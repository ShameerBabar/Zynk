'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Add a simulated device contact
router.post('/', (req, res) => {
  try {
    const db = req.app.get('db');
    const { contact_name, phone_number } = req.body;
    if (!contact_name || !phone_number) {
      return res.status(400).json({ error: 'Name and phone number are required' });
    }

    const existing = db.prepare('SELECT id FROM device_contacts WHERE user_id = ? AND phone_number = ?').get(req.user.id, phone_number);
    if (existing) {
      return res.status(400).json({ error: 'Contact already exists' });
    }

    const id = uuidv4();
    db.prepare('INSERT INTO device_contacts (id, user_id, contact_name, phone_number) VALUES (?, ?, ?, ?)').run(id, req.user.id, contact_name, phone_number);
    return res.status(201).json({ id, contact_name, phone_number });
  } catch (err) {
    console.error('[CONTACTS] Add contact error:', err.message);
    return res.status(500).json({ error: 'Failed to add contact' });
  }
});

// Remove a simulated device contact
router.delete('/:id', (req, res) => {
  try {
    const db = req.app.get('db');
    db.prepare('DELETE FROM device_contacts WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    return res.json({ success: true });
  } catch (err) {
    console.error('[CONTACTS] Delete contact error:', err.message);
    return res.status(500).json({ error: 'Failed to delete contact' });
  }
});

// Sync contacts
router.get('/sync', (req, res) => {
  try {
    const db = req.app.get('db');
    
    // Left join device_contacts with users on phone number
    const synced = db.prepare(`
      SELECT 
        dc.id as device_contact_id, 
        dc.contact_name, 
        dc.phone_number,
        u.id as zynk_user_id,
        u.username,
        u.display_name,
        u.avatar_url,
        u.status_text,
        u.is_online,
        u.last_seen
      FROM device_contacts dc
      LEFT JOIN users u ON u.phone = dc.phone_number
      WHERE dc.user_id = ?
      ORDER BY dc.contact_name ASC
    `).all(req.user.id);

    const result = synced.map(row => {
      if (row.zynk_user_id) {
        return {
          id: row.device_contact_id,
          contact_name: row.contact_name,
          phone_number: row.phone_number,
          is_on_zynk: true,
          user: {
            id: row.zynk_user_id,
            username: row.username,
            display_name: row.display_name,
            avatar_url: row.avatar_url,
            status_text: row.status_text,
            is_online: row.is_online,
            last_seen: row.last_seen
          }
        };
      } else {
        return {
          id: row.device_contact_id,
          contact_name: row.contact_name,
          phone_number: row.phone_number,
          is_on_zynk: false,
          user: null
        };
      }
    });

    return res.json({ contacts: result });
  } catch (err) {
    console.error('[CONTACTS] Sync contacts error:', err.message);
    return res.status(500).json({ error: 'Failed to sync contacts' });
  }
});

module.exports = router;
