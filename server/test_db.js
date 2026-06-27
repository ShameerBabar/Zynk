const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('c:\\Zynk(Desktop)\\server\\db\\zynk.db');

const users = db.prepare(`SELECT id, username FROM users`).all();
console.log('Users:', users.map(u => u.username));

const shameer = db.prepare(`SELECT id FROM users WHERE username = 'shameer' OR username = 'Shameer' LIMIT 1`).get();
if (!shameer) {
  console.log('User not found!');
  process.exit(1);
}

const userId = shameer.id;
console.log('User ID:', userId);

const conversations = db.prepare(`
  SELECT c.id, c.type, c.name, cm.is_pinned
  FROM conversations c
  JOIN conversation_members cm ON cm.conversation_id = c.id
  WHERE cm.user_id = ?
`).all(userId);

console.log('Conversations for user:', conversations.length);

const result = conversations.map(conv => {
  if (conv.type === 'private') {
    let otherUser = db.prepare(`
      SELECT u.id, u.username
      FROM conversation_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.conversation_id = ? AND cm.user_id != ?
    `).get(conv.id, userId);

    if (!otherUser) {
      otherUser = db.prepare(`
        SELECT id, username
        FROM users WHERE id = ?
      `).get(userId);
      if (otherUser) otherUser.is_self = true;
    }
    return { ...conv, otherUser };
  }
  return conv;
});

console.log('Result mapped:', JSON.stringify(result.filter(c => c.otherUser && c.otherUser.is_self), null, 2));
