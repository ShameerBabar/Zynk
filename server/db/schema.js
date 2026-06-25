/**
 * Database Schema — Zynk Messaging App
 * 
 * Creates all required tables and indexes for the messaging platform.
 * Uses SQLite (better-sqlite3) with WAL journal mode for concurrent reads.
 */

'use strict';

/**
 * Initializes the database schema: creates tables and indexes if they
 * don't already exist. Safe to call on every server start.
 * 
 * @param {import('better-sqlite3').Database} db - better-sqlite3 instance
 */
function initializeDatabase(db) {
  // Enable WAL mode for better concurrent read performance
  db.exec('PRAGMA journal_mode = WAL');
  // Enforce foreign key constraints
  db.exec('PRAGMA foreign_keys = ON');

  // Wrap all DDL in a transaction for atomicity
  db.exec('BEGIN');
  try {
    // ── Users ────────────────────────────────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        username      TEXT UNIQUE NOT NULL,
        phone         TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name  TEXT,
        avatar_url    TEXT,
        status_text   TEXT DEFAULT 'Hey there! I am using Zynk',
        is_online     INTEGER DEFAULT 0,
        last_seen     DATETIME,
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add google_id and email columns if they don't exist
    try {
      db.exec('ALTER TABLE users ADD COLUMN google_id TEXT');
    } catch (e) {
      // Ignore if column already exists
    }
    try {
      db.exec('ALTER TABLE users ADD COLUMN email TEXT');
    } catch (e) {
      // Ignore if column already exists
    }
    try {
      db.exec('ALTER TABLE users ADD COLUMN chat_background_url TEXT');
    } catch (e) {
      // Ignore if column already exists
    }

    // ── Contacts (bidirectional friendships) ─────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS contacts (
        user_id    TEXT NOT NULL,
        contact_id TEXT NOT NULL,
        added_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, contact_id),
        FOREIGN KEY (user_id)    REFERENCES users(id),
        FOREIGN KEY (contact_id) REFERENCES users(id)
      );
    `);

    // ── Conversations (private & group chats) ────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id         TEXT PRIMARY KEY,
        type       TEXT DEFAULT 'private',
        name       TEXT,
        avatar_url TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // ── Conversation Members ─────────────────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS conversation_members (
        conversation_id TEXT NOT NULL,
        user_id         TEXT NOT NULL,
        role            TEXT DEFAULT 'member',
        joined_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_muted        INTEGER DEFAULT 0,
        PRIMARY KEY (conversation_id, user_id),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id),
        FOREIGN KEY (user_id)         REFERENCES users(id)
      );
    `);

    try {
      db.exec('ALTER TABLE conversation_members ADD COLUMN is_muted INTEGER DEFAULT 0');
    } catch (e) {
      // Ignore if column already exists
    }

    // ── Messages ─────────────────────────────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id              TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        sender_id       TEXT NOT NULL,
        content         TEXT,
        type            TEXT DEFAULT 'text',
        file_url        TEXT,
        file_name       TEXT,
        file_size       INTEGER,
        is_deleted      INTEGER DEFAULT 0,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id),
        FOREIGN KEY (sender_id)       REFERENCES users(id)
      );
    `);

    // ── Message Read Receipts ────────────────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS message_reads (
        message_id TEXT NOT NULL,
        user_id    TEXT NOT NULL,
        read_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (message_id, user_id)
      );
    `);

    // ── Message Delivery Receipts ────────────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS message_deliveries (
        message_id   TEXT NOT NULL,
        user_id      TEXT NOT NULL,
        delivered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (message_id, user_id)
      );
    `);

    // ── Polls ────────────────────────────────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS polls (
        id             TEXT PRIMARY KEY,
        message_id     TEXT UNIQUE NOT NULL,
        question       TEXT NOT NULL,
        allow_multiple INTEGER DEFAULT 0,
        is_anonymous   INTEGER DEFAULT 0,
        allow_change   INTEGER DEFAULT 1,
        is_closed      INTEGER DEFAULT 0,
        expires_at     DATETIME,
        outcome_notified INTEGER DEFAULT 0,
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
      );
    `);

    // ── Poll Options ─────────────────────────────────────────────────────
    try {
      db.exec('ALTER TABLE polls ADD COLUMN outcome_notified INTEGER DEFAULT 0');
    } catch (e) {}

    db.exec(`
      CREATE TABLE IF NOT EXISTS poll_options (
        id         TEXT PRIMARY KEY,
        poll_id    TEXT NOT NULL,
        text       TEXT NOT NULL,
        position   INTEGER NOT NULL,
        FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
      );
    `);

    // ── Poll Votes ───────────────────────────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS poll_votes (
        poll_id    TEXT NOT NULL,
        option_id  TEXT NOT NULL,
        user_id    TEXT NOT NULL,
        voted_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (poll_id, option_id, user_id),
        FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
        FOREIGN KEY (option_id) REFERENCES poll_options(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // ── Indexes ──────────────────────────────────────────────────────────
    // Speed up message listing per conversation, ordered by time
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_time
        ON messages(conversation_id, created_at);
    `);

    // Speed up user lookups by username
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_username
        ON users(username);
    `);

    // Speed up user lookups by phone number
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_phone
        ON users(phone);
    `);

    // Speed up user lookups by Google ID and Email
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id
        ON users(google_id);
    `);
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
        ON users(email);
    `);

    // Speed up read-receipt queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_message_reads_message
        ON message_reads(message_id);
    `);

    // Speed up delivery-receipt queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_message_deliveries_message
        ON message_deliveries(message_id);
    `);

    // Speed up member-to-conversation queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_conversation_members_user
        ON conversation_members(user_id);
    `);

    // ── Device Contacts (Simulated Phone Address Book) ───────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS device_contacts (
        id           TEXT PRIMARY KEY,
        user_id      TEXT NOT NULL,
        contact_name TEXT NOT NULL,
        phone_number TEXT NOT NULL,
        added_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_device_contacts_user
        ON device_contacts(user_id);
    `);

    // ── Web Push Subscriptions ───────────────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id      TEXT NOT NULL,
        subscription TEXT NOT NULL,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, subscription),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
        ON push_subscriptions(user_id);
    `);

    // ── FCM Tokens ────────────────────────────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS fcm_tokens (
        id           TEXT PRIMARY KEY,
        user_id      TEXT NOT NULL,
        token        TEXT UNIQUE NOT NULL,
        device_type  TEXT DEFAULT 'web',
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user
        ON fcm_tokens(user_id);
    `);

    // ── Friend Requests ──────────────────────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS friend_requests (
        id          TEXT PRIMARY KEY,
        sender_id   TEXT NOT NULL,
        receiver_id TEXT NOT NULL,
        status      TEXT DEFAULT 'pending',
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(sender_id, receiver_id),
        FOREIGN KEY (sender_id)   REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver
        ON friend_requests(receiver_id, status);
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_friend_requests_sender
        ON friend_requests(sender_id, status);
    `);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  // Ensure the reserved 'system' user exists — required because messages.sender_id
  // has a FK to users.id, and system messages (group created, member added, etc.)
  // use sender_id = 'system'. Without this row, group creation crashes.
  db.exec(`PRAGMA foreign_keys = OFF`);
  db.exec(`
    INSERT OR IGNORE INTO users (id, username, phone, password_hash, display_name, status_text)
    VALUES ('system', 'system', '+00000000000', 'system-reserved', 'Zynk', 'System')
  `);
  db.exec(`PRAGMA foreign_keys = ON`);

  console.log('[DB] Schema initialized successfully');
}

module.exports = { initializeDatabase };
