/**
 * Push Notification Routes — Zynk
 * Handles saving/removing push subscriptions and sending push notifications.
 */
'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');

// Use the same key defined in server.js (or fall back to defaults)
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BHAQXEBhzAEkRcdlz87_NSn5ATHhHGQwYi7wWWp31h_XurkwSX9Y_y-mjvSLIkuVUiJHLuSvmq_aNRqAz03hF14';

const router = express.Router();
router.use(authenticate);

// GET /api/push/vapid-public-key — return public VAPID key to client
router.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// POST /api/push/subscribe — save or update push subscription
router.post('/subscribe', (req, res) => {
  try {
    const db = req.app.get('db');
    const userId = req.user.id;
    const subscription = req.body; // { endpoint, expirationTime, keys: { p256dh, auth } }

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Invalid subscription object.' });
    }

    const endpoint = subscription.endpoint;
    const subJson = JSON.stringify(subscription);

    // Delete any existing subscription for this user+endpoint, then insert fresh
    // This avoids UNIQUE constraint issues from JSON field ordering differences
    db.prepare(`
      DELETE FROM push_subscriptions WHERE user_id = ? AND subscription LIKE ?
    `).run(userId, `%${endpoint}%`);

    db.prepare(`
      INSERT INTO push_subscriptions (user_id, subscription, created_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `).run(userId, subJson);

    console.log(`[PUSH] Subscription saved for user ${userId}`);
    return res.status(201).json({ message: 'Subscribed successfully.' });
  } catch (err) {
    console.error('[PUSH] Subscribe error:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE /api/push/unsubscribe — remove a push subscription by endpoint
router.delete('/unsubscribe', (req, res) => {
  try {
    const db = req.app.get('db');
    const userId = req.user.id;
    const { endpoint } = req.body;

    if (!endpoint) return res.status(400).json({ error: 'Endpoint required.' });

    db.prepare(`
      DELETE FROM push_subscriptions WHERE user_id = ? AND subscription LIKE ?
    `).run(userId, `%${endpoint}%`);

    console.log(`[PUSH] Subscription removed for user ${userId}`);
    return res.json({ message: 'Unsubscribed successfully.' });
  } catch (err) {
    console.error('[PUSH] Unsubscribe error:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
