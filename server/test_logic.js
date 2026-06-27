const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('C:/Zynk(Desktop)/server/db/zynk.db');

const userId = 'd504038d-734f-48b2-957a-d1d52e5c0740';

const conversations = db.prepare(`
  SELECT c.id, c.type, c.name, c.avatar_url, c.created_by, c.created_at, cm.is_muted, cm.theme, cm.wallpaper, cm.is_pinned, cm.pinned_color
  FROM conversations c
  JOIN conversation_members cm ON cm.conversation_id = c.id
  WHERE cm.user_id = ?
`).all(userId);

const result = conversations.map(conv => {
  let otherUser = null;
  
  if (conv.type === 'private') {
    otherUser = db.prepare(`
      SELECT u.id, u.username, u.display_name, u.avatar_url, u.is_online, u.last_seen, u.status_text
      FROM conversation_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.conversation_id = ? AND cm.user_id != ?
    `).get(conv.id, userId);

    if (!otherUser) {
      // Self chat: the only member is the user themselves
      otherUser = db.prepare(`
        SELECT id, username, display_name, avatar_url, is_online, last_seen, status_text
        FROM users WHERE id = ?
      `).get(userId);
      if (otherUser) {
        otherUser.is_self = true;
      }
    }
  }

  const lastMessage = db.prepare(`
    SELECT m.id, m.sender_id, m.content, m.type, m.file_name, m.is_deleted, m.created_at,
           u.username AS sender_username, u.display_name AS sender_display_name,
           CASE
             WHEN (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = m.conversation_id AND user_id != m.sender_id) = 0 THEN 'read'
             WHEN (SELECT COUNT(*) FROM message_reads WHERE message_id = m.id AND user_id != m.sender_id) >= (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = m.conversation_id AND user_id != m.sender_id) THEN 'read'
             WHEN (SELECT COUNT(*) FROM message_deliveries WHERE message_id = m.id AND user_id != m.sender_id) >= (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = m.conversation_id AND user_id != m.sender_id) THEN 'delivered'
             ELSE 'sent'
           END AS status
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    WHERE m.conversation_id = ?
    ORDER BY m.created_at DESC
    LIMIT 1
  `).get(conv.id);

  let formattedLastMessage = null;
  if (lastMessage) {
    formattedLastMessage = {
      id: lastMessage.id,
      sender_id: lastMessage.sender_id,
      content: lastMessage.content,
      type: lastMessage.type,
      created_at: lastMessage.created_at,
      status: lastMessage.status
    };
  }

  return {
    ...conv,
    lastMessage: formattedLastMessage,
    otherUser
  };
});

result.sort((a, b) => {
  const timeA = a.lastMessage ? new Date(a.lastMessage.created_at).getTime() : 0;
  const timeB = b.lastMessage ? new Date(b.lastMessage.created_at).getTime() : 0;
  return timeB - timeA;
});

console.log(JSON.stringify(result, null, 2));
