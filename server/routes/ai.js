const express = require('express');
const router = express.Router();
const { GoogleGenAI } = require('@google/genai');
const { authenticate } = require('../middleware/auth');

// POST /api/ai/summarize
router.post('/summarize', authenticate, async (req, res) => {
  const { conversationId, limit = 100 } = req.body;
  const userId = req.user.id;
  
  if (!conversationId) {
    return res.status(400).json({ error: 'Conversation ID is required' });
  }

  // Check if GEMINI_API_KEY is available
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
  }

  try {
    const db = req.app.locals.db;

    // Verify user is part of the conversation
    const isMember = db.prepare(
      'SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?'
    ).get(conversationId, userId);

    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this conversation' });
    }

    // Fetch the last N messages
    const messages = db.prepare(`
      SELECT m.content, m.type, u.display_name, u.username, m.created_at
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = ?
      ORDER BY m.created_at DESC
      LIMIT ?
    `).all(conversationId, limit);

    if (messages.length === 0) {
      return res.json({ summary: 'No messages to summarize.' });
    }

    // Since we ordered by DESC (to get the latest), we need to reverse them back to chronological order
    messages.reverse();

    // Format transcript
    const transcriptLines = messages.map(msg => {
      const name = msg.display_name || msg.username || 'User';
      if (msg.type === 'image' || msg.type === 'video' || msg.type === 'audio' || msg.type === 'file') {
        return `[${name} sent an attachment: ${msg.type}]`;
      }
      return `[${name}]: ${msg.content}`;
    });

    const transcript = transcriptLines.join('\n');

    // Initialize Gemini AI
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    const prompt = `You are Zynk Bot, an AI assistant in a chat application.
Please summarize the following chat transcript concisely using bullet points. Focus on key decisions, important updates, and action items. Do not include unnecessary chatter.

Chat Transcript:
${transcript}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const summary = response.text;

    res.json({ summary });
  } catch (error) {
    console.error('[AI] Summarization error:', error);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

module.exports = router;
