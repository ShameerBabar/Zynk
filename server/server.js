const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const { Server } = require('socket.io');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const webpush = require('web-push');
require('dotenv').config();

// ── Web Push VAPID setup ──────────────────────────────────────────────────
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY  || 'BHAQXEBhzAEkRcdlz87_NSn5ATHhHGQwYi7wWWp31h_XurkwSX9Y_y-mjvSLIkuVUiJHLuSvmq_aNRqAz03hF14';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || 'mmqmS_S5UMKMfcNpwLNDpl8_Rg1xxDrjcIvDiPc4Pgk';
webpush.setVapidDetails('mailto:zynk@example.com', VAPID_PUBLIC, VAPID_PRIVATE);

/**
 * Send a Web Push notification to all subscriptions of a given user.
 * @param {object} db - SQLite db instance
 * @param {string} targetUserId
 * @param {object} payload - { title, body, icon, tag, data }
 */
function sendPushToUser(db, targetUserId, payload) {
  try {
    const rows = db.prepare('SELECT subscription FROM push_subscriptions WHERE user_id = ?').all(targetUserId);
    for (const row of rows) {
      let sub;
      try { sub = JSON.parse(row.subscription); } catch { continue; }
      webpush.sendNotification(sub, JSON.stringify(payload)).catch(err => {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Subscription expired/gone — remove it
          db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND subscription = ?').run(targetUserId, row.subscription);
        } else {
          console.error('[PUSH] Send error:', err.message);
        }
      });
    }
  } catch (err) {
    console.error('[PUSH] sendPushToUser error:', err.message);
  }
}

const { initializeDatabase } = require('./db/schema');
const setupSocketHandlers = require('./socket/handler');

const fs = require('fs');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Dynamic CORS configurations
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : [
      'http://localhost:5173', 
      'http://127.0.0.1:5173',
      'https://zynk-chat-shameer-2026.web.app',
      'https://zynk-chat-shameer-2026.firebaseapp.com'
    ];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

// Middleware
app.use(helmet({ crossOriginResourcePolicy: false })); // Allow loading images from localhost/external
app.use(cors({
  origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Ensure upload directory exists and serve it
const uploadsPath = process.env.UPLOADS_PATH || path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
app.use('/uploads', express.static(uploadsPath));

// Database setup
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'db', 'zynk.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
initializeDatabase(db);

// Make db + io accessible to routes
app.set('db', db);
app.set('io', io);

// Mount Routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const messageRoutes = require('./routes/messages');
const groupRoutes = require('./routes/groups');
const fileRoutes = require('./routes/files');
const contactsRoutes = require('./routes/contacts');
const pushRoutes = require('./routes/push');
const friendsRoutes = require('./routes/friends');

// Public route for invite links
app.get('/api/public/user/:username', (req, res) => {
  try {
    const db = req.app.get('db');
    const user = db.prepare(`
      SELECT id, username, display_name, avatar_url, status_text 
      FROM users WHERE username = ? COLLATE NOCASE
    `).get(req.params.username);
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ user });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/friends', friendsRoutes);

// Setup Socket.io (pass sendPushToUser so the handler can push when user is offline)
setupSocketHandlers(io, db, sendPushToUser);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something broke!', details: err.message });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Zynk backend server running on port ${PORT}`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  db.close();
  process.exit();
});
