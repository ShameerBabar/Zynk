const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const { Server } = require('socket.io');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
require('dotenv').config();

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

// Make db accessible to routes
app.set('db', db);

// Mount Routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const messageRoutes = require('./routes/messages');
const groupRoutes = require('./routes/groups');
const fileRoutes = require('./routes/files');
const contactsRoutes = require('./routes/contacts');

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

// Setup Socket.io
setupSocketHandlers(io, db);

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
