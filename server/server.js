const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const { Server } = require('socket.io');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const webpush = require('web-push');
const fs = require('fs');
const admin = require('firebase-admin');
require('dotenv').config();

// Initialize Firebase Admin safely
try {
  let serviceAccount = null;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } else if (fs.existsSync(path.join(__dirname, 'firebase-service-account.json'))) {
    serviceAccount = require('./firebase-service-account.json');
  }

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('[FIREBASE] Admin SDK initialized successfully');
  } else {
    console.warn('[FIREBASE] Warning: No service account credentials found. Background notifications via FCM will be disabled.');
  }
} catch (err) {
  console.error('[FIREBASE] Admin SDK initialization error:', err.message);
}

// ── Web Push VAPID setup ──────────────────────────────────────────────────
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY  || 'BHAQXEBhzAEkRcdlz87_NSn5ATHhHGQwYi7wWWp31h_XurkwSX9Y_y-mjvSLIkuVUiJHLuSvmq_aNRqAz03hF14';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || 'mmqmS_S5UMKMfcNpwLNDpl8_Rg1xxDrjcIvDiPc4Pgk';
webpush.setVapidDetails('mailto:zynk@example.com', VAPID_PUBLIC, VAPID_PRIVATE);

// ── FCM Push Queue ────────────────────────────────────────────────────────
const pushQueue = [];

function processPushQueue(db) {
  if (pushQueue.length === 0) return;
  if (admin.apps.length === 0) {
    console.warn('[PUSH] Firebase Admin not initialized, push notifications cannot be sent.');
    return;
  }

  const item = pushQueue.shift();
  const { targetUserId, payload, retries } = item;

  try {
    const tokens = db.prepare('SELECT token FROM fcm_tokens WHERE user_id = ?').all(targetUserId);
    if (tokens.length === 0) {
      setTimeout(() => processPushQueue(db), 10);
      return;
    }

    let pending = tokens.length;
    let successCount = 0;
    let failCount = 0;

    tokens.forEach(row => {
      admin.messaging().send({
        data: {
          title: payload.title || 'Zynk',
          body: payload.body || '',
          icon: payload.icon || '/manifest-icon-192.png',
          badge: payload.badge || '/manifest-icon-192.png',
          tag: payload.tag || 'zynk-notification',
          type: payload.data?.type || 'message',
          conversationId: payload.data?.conversationId || '',
          messageId: payload.data?.messageId || '',
          url: payload.data?.url || '/'
        },
        token: row.token
      })
      .then((res) => {
        successCount++;
        pending--;
        if (pending === 0) finish();
      })
      .catch((error) => {
        failCount++;
        pending--;
        console.error('[PUSH] Error sending to token:', row.token, error.message);
        
        // Remove expired/invalid tokens from DB automatically
        if (
          error.code === 'messaging/invalid-registration-token' ||
          error.code === 'messaging/registration-token-not-registered'
        ) {
          console.log('[PUSH] Deleting registered invalid FCM token:', row.token);
          db.prepare('DELETE FROM fcm_tokens WHERE token = ?').run(row.token);
        }
        if (pending === 0) finish();
      });
    });

    function finish() {
      console.log(`[PUSH] Delivery report for ${targetUserId}: ${successCount} successfully sent, ${failCount} failed.`);
      
      // If all failed and we have retries left, retry after a delay
      if (successCount === 0 && retries < 3) {
        console.log(`[PUSH] Retrying notification delivery for ${targetUserId} in 3 seconds (Attempt ${retries + 1})...`);
        setTimeout(() => {
          pushQueue.push({ targetUserId, payload, retries: retries + 1 });
          processPushQueue(db);
        }, 3000);
      } else {
        // Process next item in the queue
        setTimeout(() => processPushQueue(db), 10);
      }
    }

  } catch (err) {
    console.error('[PUSH] Process queue error:', err.message);
    setTimeout(() => processPushQueue(db), 10);
  }
}

/**
 * Send a push notification to all FCM devices of a given user.
 */
function sendPushToUser(db, targetUserId, payload) {
  pushQueue.push({ targetUserId, payload, retries: 0 });
  processPushQueue(db);
}

const { initializeDatabase } = require('./db/schema');
const setupSocketHandlers = require('./socket/handler');

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

function checkOrigin(origin, callback) {
  if (!origin) return callback(null, true);
  try {
    const url = new URL(origin);
    const hostname = url.hostname;
    const isLocal = 
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]' ||
      hostname.endsWith('.local') ||
      /^192\.168\./.test(hostname) ||
      /^10\./.test(hostname) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);
      
    if (isLocal || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
  } catch (err) {
    // If URL parsing fails, reject
  }
  return callback(null, false);
}

const io = new Server(server, {
  cors: {
    origin: checkOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

// Middleware
app.use(helmet({ crossOriginResourcePolicy: false })); // Allow loading images from localhost/external
app.use(cors({
  origin: checkOrigin,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Detect HuggingFace Spaces environment (used for persistent storage paths)
const isHFSpace = !!(process.env.SPACE_ID || process.env.HF_SPACE_ID || process.env.SPACE_AUTHOR_NAME);

// Ensure upload directory exists and serve it
// On HF Spaces, use /data/uploads so files persist across restarts
const uploadsPath = process.env.UPLOADS_PATH
  || (isHFSpace ? '/data/uploads' : path.join(__dirname, 'uploads'));
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
console.log(`[FILES] Uploads directory: ${uploadsPath}`);
app.use('/uploads', express.static(uploadsPath));


// ── Database setup ───────────────────────────────────────────────────────────
// On HuggingFace Spaces, /data is the ONLY directory that persists across
// restarts and deployments. Storing zynk.db anywhere else means it gets wiped
// every time we push code, deleting all users, chats, and friends.
//
// Local dev falls back to ./db/zynk.db as before.
const dbPath = process.env.DATABASE_PATH
  || (isHFSpace ? '/data/zynk.db' : path.join(__dirname, 'db', 'zynk.db'));

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

console.log(`[DB] Using database at: ${dbPath}`);
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
