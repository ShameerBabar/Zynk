/**
 * File Upload Routes — Zynk
 * 
 * Handles general file uploads (up to 500 MB) and avatar uploads (up to 5 MB).
 * Files are stored in the `uploads/` directory.
 * All routes require authentication.
 * 
 * POST /upload — upload any file (500 MB limit)
 * POST /avatar — upload an avatar image (5 MB limit, images only)
 */

'use strict';

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All file routes are protected
router.use(authenticate);

// ── Ensure the uploads directory exists ────────────────────────────────────
// On HF Spaces or Render, use persistent data paths across restarts; the app directory does not persist.
const isHFSpace = !!(process.env.SPACE_ID || process.env.HF_SPACE_ID || process.env.SPACE_AUTHOR_NAME);
const isRender  = !!(process.env.RENDER);

const uploadsDir = process.env.UPLOADS_PATH
  || (isRender  ? '/var/data/uploads' : null)
  || (isHFSpace ? '/data/uploads' : null)
  || path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// ── General file storage configuration ─────────────────────────────────────
const generalStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    // Sanitize original filename — remove path separators and null bytes
    const safeName = file.originalname.replace(/[/\\:\0]/g, '_');
    const filename = `${Date.now()}-${uuidv4()}-${safeName}`;
    cb(null, filename);
  },
});

// General upload: 500 MB limit
const generalUpload = multer({
  storage: generalStorage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500 MB
  },
});

// ── Avatar storage configuration ───────────────────────────────────────────
const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const avatarDir = path.join(uploadsDir, 'avatars');
    if (!fs.existsSync(avatarDir)) {
      fs.mkdirSync(avatarDir, { recursive: true });
    }
    cb(null, avatarDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `${Date.now()}-${uuidv4()}${ext}`;
    cb(null, filename);
  },
});

// Avatar upload: 5 MB limit, images only
const avatarUpload = multer({
  storage: avatarStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, GIF, WebP, SVG) are allowed for avatars.'), false);
    }
  },
});

router.get('/debug', (req, res) => {
  try {
    const files = fs.readdirSync(uploadsDir);
    res.json({ uploadsDir, files });
  } catch (err) {
    res.status(500).json({ error: err.message, uploadsDir });
  }
});

/**
 * POST /upload
 * Upload a general file (any type, up to 500 MB).
 * Returns { url, name, size }.
 */
router.post('/upload', (req, res) => {
  generalUpload.single('file')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: 'File too large. Maximum size is 500 MB.' });
        }
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      }
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file provided. Use "file" as the field name.' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;

    console.log(`[FILES] File uploaded: ${req.file.originalname} (${req.file.size} bytes) by ${req.user.id}`);

    return res.status(201).json({
      url: fileUrl,
      name: req.file.originalname,
      size: req.file.size,
    });
  });
});

/**
 * POST /avatar
 * Upload an avatar image (images only, up to 5 MB).
 * Returns { url }.
 */
router.post('/avatar', (req, res) => {
  avatarUpload.single('avatar')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: 'Avatar too large. Maximum size is 5 MB.' });
        }
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      }
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No avatar provided. Use "avatar" as the field name.' });
    }

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;

    // Optionally update the user's avatar_url in the database
    try {
      const db = req.app.get('db');
      db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatarUrl, req.user.id);
    } catch (dbErr) {
      console.error('[FILES] Failed to update avatar in DB:', dbErr.message);
      // Non-fatal — the file was still uploaded
    }

    console.log(`[FILES] Avatar uploaded by ${req.user.id}: ${avatarUrl}`);

    return res.status(201).json({ url: avatarUrl });
  });
});

module.exports = router;
