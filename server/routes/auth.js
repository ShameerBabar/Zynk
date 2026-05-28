/**
 * Authentication Routes — Zynk
 * 
 * Handles user registration, login, and profile retrieval.
 * POST /register  — create a new account
 * POST /login     — authenticate with username/phone + password
 * GET  /me        — get the current authenticated user's profile
 */

'use strict';

const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { authenticate, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// Token validity duration — 90 days so users stay logged in
const TOKEN_EXPIRY = '90d';


/**
 * Generates a JWT for the given user.
 * @param {object} user - User row from the database
 * @returns {string} Signed JWT
 */
function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

/**
 * Returns a sanitized user object (no password hash).
 * @param {object} user - Raw user row
 * @returns {object} Safe user object
 */
function sanitizeUser(user) {
  const { password_hash, ...safe } = user;
  return safe;
}

/**
 * POST /register
 * Body: { username, phone, password, display_name? }
 */
router.post('/register', (req, res) => {
  try {
    const db = req.app.get('db');
    const { username, phone, password, display_name } = req.body;

    // ── Validation ─────────────────────────────────────────────────────
    if (!username || !phone || !password) {
      return res.status(400).json({ error: 'Username, phone, and password are required.' });
    }

    // Username: 3-20 alphanumeric + underscores
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be between 3 and 20 characters.' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores.' });
    }

    // Phone: basic international format validation (digits, optional leading +)
    const phoneClean = phone.replace(/[\s\-()]/g, '');
    if (!/^\+?\d{7,15}$/.test(phoneClean)) {
      return res.status(400).json({ error: 'Invalid phone number format.' });
    }

    // Password: minimum 6 characters
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    // ── Uniqueness checks ──────────────────────────────────────────────
    const existingUsername = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existingUsername) {
      return res.status(409).json({ error: 'Username already taken.' });
    }

    const existingPhone = db.prepare('SELECT id FROM users WHERE phone = ?').get(phoneClean);
    if (existingPhone) {
      return res.status(409).json({ error: 'Phone number already registered.' });
    }

    // ── Create user ────────────────────────────────────────────────────
    const id = uuidv4();
    const passwordHash = bcrypt.hashSync(password, 10);

    db.prepare(`
      INSERT INTO users (id, username, phone, password_hash, display_name)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, username, phoneClean, passwordHash, display_name || username);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    const token = generateToken(user);

    console.log(`[AUTH] New user registered: ${username} (${id})`);

    return res.status(201).json({
      user: sanitizeUser(user),
      token,
    });
  } catch (err) {
    console.error('[AUTH] Registration error:', err.message);
    return res.status(500).json({ error: 'Internal server error during registration.' });
  }
});

/**
 * POST /login
 * Body: { identifier, password }
 * `identifier` can be a username OR phone number.
 */
router.post('/login', (req, res) => {
  try {
    const db = req.app.get('db');
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Identifier and password are required.' });
    }

    // Try finding user by username first, then by phone
    let user = db.prepare('SELECT * FROM users WHERE username = ?').get(identifier);
    if (!user) {
      const phoneClean = identifier.replace(/[\s\-()]/g, '');
      user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phoneClean);
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // Verify password
    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const token = generateToken(user);

    console.log(`[AUTH] User logged in: ${user.username}`);

    return res.json({
      user: sanitizeUser(user),
      token,
    });
  } catch (err) {
    console.error('[AUTH] Login error:', err.message);
    return res.status(500).json({ error: 'Internal server error during login.' });
  }
});

/**
 * POST /google
 * Body: { idToken }
 */
router.post('/google', async (req, res) => {
  try {
    const db = req.app.get('db');
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: 'idToken is required.' });
    }

    // Verify Google ID Token via Google API
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
    if (!response.ok) {
      return res.status(401).json({ error: 'Invalid Google token.' });
    }

    const payload = await response.json();
    const { sub: googleId, email, name, picture } = payload;
    console.log('[AUTH] Google Sign-In Payload:', { googleId, email, name, picture });

    // 1. Look up user by google_id
    let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId);
    console.log('[AUTH] User from DB by Google ID:', user);

    if (!user) {
      // 2. Look up user by email
      user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

      if (user) {
        // Link google account to existing user
        db.prepare('UPDATE users SET google_id = ?, avatar_url = COALESCE(avatar_url, ?) WHERE id = ?')
          .run(googleId, picture, user.id);
        // Refresh user record
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
      } else {
        // 3. Create new user
        const id = uuidv4();
        
        // Generate a unique username from email prefix
        const emailPrefix = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '');
        let username = emailPrefix;
        let suffix = 1;
        
        // Ensure username is unique
        while (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
          username = `${emailPrefix}${suffix}`;
          suffix++;
        }

        // Set google placeholder for phone
        const phonePlaceholder = `google-${googleId}`;
        const passwordHashPlaceholder = 'GOOGLE_OAUTH_ACCOUNT';

        db.prepare(`
          INSERT INTO users (id, username, phone, password_hash, display_name, avatar_url, google_id, email)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, username, phonePlaceholder, passwordHashPlaceholder, name || username, picture || null, googleId, email);

        user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
        console.log(`[AUTH] New user registered via Google: ${username} (${id})`);
      }
    }

    const token = generateToken(user);

    return res.json({
      user: sanitizeUser(user),
      token
    });

  } catch (err) {
    console.error('[AUTH] Google auth error:', err.message);
    return res.status(500).json({ error: 'Internal server error during Google login.' });
  }
});

/**
 * GET /me
 * Protected — returns the currently authenticated user's profile.
 */
router.get('/me', authenticate, (req, res) => {
  try {
    const db = req.app.get('db');
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.json({ user: sanitizeUser(user) });
  } catch (err) {
    console.error('[AUTH] /me error:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
