/**
 * JWT Authentication Middleware — Zynk
 * 
 * Extracts and verifies a JSON Web Token from the Authorization header.
 * On success, attaches the decoded payload to `req.user`.
 */

'use strict';

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'zynk-secret-key-change-in-production';

/**
 * Express middleware that enforces JWT authentication.
 * Expects header:  Authorization: Bearer <token>
 * 
 * On success → sets req.user = { id, username, ... } and calls next().
 * On failure → responds with 401.
 */
function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authentication required. No token provided.' });
    }

    // Support "Bearer <token>" format only
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ error: 'Invalid authorization format. Use: Bearer <token>' });
    }

    const token = parts[1];

    // Verify and decode the token
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;

    next();
  } catch (err) {
    // Differentiate between expired and invalid tokens
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired. Please log in again.' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token.' });
    }
    return res.status(401).json({ error: 'Authentication failed.' });
  }
}

module.exports = { authenticate, JWT_SECRET };
