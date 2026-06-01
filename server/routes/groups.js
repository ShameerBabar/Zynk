/**
 * Group Routes — Zynk
 * 
 * Handles group chat creation, info retrieval, updates, member management,
 * and system messages for group events.
 * All routes require authentication.
 * 
 * POST   /             — create a group
 * GET    /:id          — get group info with members
 * PUT    /:id          — update group name/avatar (admin only)
 * POST   /:id/members  — add members (admin only)
 * DELETE /:id/members/:userId — remove member or leave group
 */

'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All group routes are protected
router.use(authenticate);

/**
 * Helper: inserts a system message into a conversation.
 * System messages have sender_id = 'system' and type = 'system'.
 */
function insertSystemMessage(db, conversationId, content) {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO messages (id, conversation_id, sender_id, content, type)
    VALUES (?, ?, 'system', ?, 'system')
  `).run(id, conversationId, content);
  return id;
}

/**
 * Helper: checks if a user is an admin of a group.
 */
function isGroupAdmin(db, conversationId, userId) {
  const member = db.prepare(`
    SELECT role FROM conversation_members
    WHERE conversation_id = ? AND user_id = ?
  `).get(conversationId, userId);
  return member && member.role === 'admin';
}

/**
 * POST /
 * Create a new group.
 * Body: { name, memberIds: string[], avatar_url? }
 */
router.post('/', (req, res) => {
  try {
    const db = req.app.get('db');
    const { name, memberIds, avatar_url } = req.body;
    const creatorId = req.user.id;

    // ── Validation ─────────────────────────────────────────────────────
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Group name is required.' });
    }

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ error: 'At least one member is required.' });
    }

    // Remove duplicates and the creator from memberIds (creator is added as admin)
    const uniqueMembers = [...new Set(memberIds.filter((id) => id !== creatorId))];

    // Verify all member IDs exist
    for (const memberId of uniqueMembers) {
      const exists = db.prepare('SELECT id FROM users WHERE id = ?').get(memberId);
      if (!exists) {
        return res.status(404).json({ error: `User ${memberId} not found.` });
      }
    }

    // ── Create group ───────────────────────────────────────────────────
    const conversationId = uuidv4();
    const creatorUser = db.prepare('SELECT display_name, username FROM users WHERE id = ?').get(creatorId);
    const creatorName = creatorUser.display_name || creatorUser.username;

    db.exec('BEGIN');
try {
      // Create the conversation
      db.prepare(`
        INSERT INTO conversations (id, type, name, avatar_url, created_by)
        VALUES (?, 'group', ?, ?, ?)
      `).run(conversationId, name.trim(), avatar_url || null, creatorId);

      // Add creator as admin
      db.prepare(`
        INSERT INTO conversation_members (conversation_id, user_id, role)
        VALUES (?, ?, 'admin')
      `).run(conversationId, creatorId);

      // Add members
      for (const memberId of uniqueMembers) {
        db.prepare(`
          INSERT INTO conversation_members (conversation_id, user_id, role)
          VALUES (?, ?, 'member')
        `).run(conversationId, memberId);
      }

      // System message: group created
      insertSystemMessage(db, conversationId, `${creatorName} created the group "${name.trim()}"`);
    
db.exec('COMMIT');
} catch (err) {
db.exec('ROLLBACK');
throw err;
}

    // Fetch and return the created group
    const group = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId);
    const members = db.prepare(`
      SELECT u.id, u.username, u.display_name, u.avatar_url, u.is_online, cm.role
      FROM conversation_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.conversation_id = ?
    `).all(conversationId);

    console.log(`[GROUPS] Group created: "${name.trim()}" (${conversationId}) by ${creatorId}`);

    return res.status(201).json({ group: { ...group, members } });
  } catch (err) {
    console.error('[GROUPS] Create group error:', err.message);
    return res.status(500).json({ error: 'Internal server error creating group.' });
  }
});

/**
 * GET /:id
 * Returns group info with its member list.
 */
router.get('/:id', (req, res) => {
  try {
    const db = req.app.get('db');
    const groupId = req.params.id;

    const group = db.prepare('SELECT * FROM conversations WHERE id = ? AND type = ?').get(groupId, 'group');
    if (!group) {
      return res.status(404).json({ error: 'Group not found.' });
    }

    // Verify the requester is a member
    const isMember = db.prepare(
      'SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?'
    ).get(groupId, req.user.id);

    if (!isMember) {
      return res.status(403).json({ error: 'You are not a member of this group.' });
    }

    const members = db.prepare(`
      SELECT u.id, u.username, u.display_name, u.avatar_url, u.is_online, u.last_seen, cm.role, cm.joined_at
      FROM conversation_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.conversation_id = ?
      ORDER BY cm.role DESC, cm.joined_at ASC
    `).all(groupId);

    return res.json({ group: { ...group, members } });
  } catch (err) {
    console.error('[GROUPS] Get group error:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * PUT /:id
 * Update group name and/or avatar. Admin only.
 * Body: { name?, avatar_url? }
 */
router.put('/:id', (req, res) => {
  try {
    const db = req.app.get('db');
    const groupId = req.params.id;
    const { name, avatar_url } = req.body;

    // Verify group exists
    const group = db.prepare('SELECT * FROM conversations WHERE id = ? AND type = ?').get(groupId, 'group');
    if (!group) {
      return res.status(404).json({ error: 'Group not found.' });
    }

    // Check admin privileges
    if (!isGroupAdmin(db, groupId, req.user.id)) {
      return res.status(403).json({ error: 'Only admins can update group settings.' });
    }

    // Build dynamic update
    const updates = [];
    const params = [];

    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({ error: 'Group name cannot be empty.' });
      }
      updates.push('name = ?');
      params.push(name.trim());
    }
    if (avatar_url !== undefined) {
      updates.push('avatar_url = ?');
      params.push(avatar_url);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    params.push(groupId);
    db.prepare(`UPDATE conversations SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    // System message for name change
    if (name !== undefined) {
      const user = db.prepare('SELECT display_name, username FROM users WHERE id = ?').get(req.user.id);
      const userName = user.display_name || user.username;
      insertSystemMessage(db, groupId, `${userName} changed the group name to "${name.trim()}"`);
    }

    const updatedGroup = db.prepare('SELECT * FROM conversations WHERE id = ?').get(groupId);

    console.log(`[GROUPS] Group updated: ${groupId}`);

    return res.json({ group: updatedGroup });
  } catch (err) {
    console.error('[GROUPS] Update group error:', err.message);
    return res.status(500).json({ error: 'Internal server error updating group.' });
  }
});

/**
 * POST /:id/members
 * Add members to the group. Admin only.
 * Body: { memberIds: string[] }
 */
router.post('/:id/members', (req, res) => {
  try {
    const db = req.app.get('db');
    const groupId = req.params.id;
    const { memberIds } = req.body;

    // Verify group exists
    const group = db.prepare('SELECT * FROM conversations WHERE id = ? AND type = ?').get(groupId, 'group');
    if (!group) {
      return res.status(404).json({ error: 'Group not found.' });
    }

    // Check requester is a group member (any member can add others)
    const isMember = db.prepare(
      'SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?'
    ).get(groupId, req.user.id);
    if (!isMember) {
      return res.status(403).json({ error: 'You must be a member of this group to add others.' });
    }

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ error: 'memberIds array is required.' });
    }

    const adder = db.prepare('SELECT display_name, username FROM users WHERE id = ?').get(req.user.id);
    const adderName = adder.display_name || adder.username;

    const addedMembers = [];

    db.exec('BEGIN');
try {
      for (const memberId of memberIds) {
        // Check the user exists
        const user = db.prepare('SELECT id, display_name, username FROM users WHERE id = ?').get(memberId);
        if (!user) continue;

        // Check if already a member
        const existing = db.prepare(
          'SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?'
        ).get(groupId, memberId);
        if (existing) continue;

        // Add the member
        db.prepare(`
          INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, 'member')
        `).run(groupId, memberId);

        const memberName = user.display_name || user.username;
        insertSystemMessage(db, groupId, `${adderName} added ${memberName}`);
        addedMembers.push(memberId);
      }
    
db.exec('COMMIT');
} catch (err) {
db.exec('ROLLBACK');
throw err;
}

    // Return updated member list (excluding system user)
    const members = db.prepare(`
      SELECT u.id, u.username, u.display_name, u.avatar_url, u.is_online, cm.role
      FROM conversation_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.conversation_id = ? AND u.id != 'system'
    `).all(groupId);

    console.log(`[GROUPS] Members added to ${groupId}: ${addedMembers.join(', ')}`);

    // Emit real-time events so the system messages appear live
    const io = req.app.get('io');
    if (io && addedMembers.length > 0) {
      // Notify the entire group room that new members were added
      io.to(groupId).emit('group_member_added', { groupId, members, addedMembers });
      // Tell each new member's socket to join the group room
      addedMembers.forEach(newMemberId => {
        io.to(newMemberId).emit('group_joined', { groupId, group: { id: groupId, name: group.name, type: 'group', members } });
      });
    }

    return res.json({ members, addedMembers });
  } catch (err) {
    console.error('[GROUPS] Add members error:', err.message);
    return res.status(500).json({ error: 'Internal server error adding members.' });
  }
});

/**
 * DELETE /:id/members/:userId
 * Remove a member from the group, or leave the group if userId matches the requester.
 * Admins can remove anyone; members can only remove themselves (leave).
 */
router.delete('/:id/members/:userId', (req, res) => {
  try {
    const db = req.app.get('db');
    const groupId = req.params.id;
    const targetUserId = req.params.userId;
    const requesterId = req.user.id;

    // Verify group exists
    const group = db.prepare('SELECT * FROM conversations WHERE id = ? AND type = ?').get(groupId, 'group');
    if (!group) {
      return res.status(404).json({ error: 'Group not found.' });
    }

    // Is the requester a member at all?
    const requesterMembership = db.prepare(
      'SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?'
    ).get(groupId, requesterId);

    if (!requesterMembership) {
      return res.status(403).json({ error: 'You are not a member of this group.' });
    }

    const isSelfLeave = targetUserId === requesterId;

    // Non-admins can only leave (remove themselves)
    if (!isSelfLeave && requesterMembership.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can remove other members.' });
    }

    // Check target is actually a member
    const targetMembership = db.prepare(
      'SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?'
    ).get(groupId, targetUserId);

    if (!targetMembership) {
      return res.status(404).json({ error: 'User is not a member of this group.' });
    }

    // Get names for system message
    const targetUser = db.prepare('SELECT display_name, username FROM users WHERE id = ?').get(targetUserId);
    const targetName = targetUser.display_name || targetUser.username;

    db.exec('BEGIN');
try {
      // Remove the member
      db.prepare(
        'DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?'
      ).run(groupId, targetUserId);

      // System message
      if (isSelfLeave) {
        insertSystemMessage(db, groupId, `${targetName} left the group`);
      } else {
        const requester = db.prepare('SELECT display_name, username FROM users WHERE id = ?').get(requesterId);
        const requesterName = requester.display_name || requester.username;
        insertSystemMessage(db, groupId, `${requesterName} removed ${targetName}`);
      }
    
db.exec('COMMIT');
} catch (err) {
db.exec('ROLLBACK');
throw err;
}

    console.log(`[GROUPS] Member ${targetUserId} removed from group ${groupId}`);

    return res.json({
      message: isSelfLeave ? 'You have left the group.' : 'Member removed successfully.',
    });
  } catch (err) {
    console.error('[GROUPS] Remove member error:', err.message);
    return res.status(500).json({ error: 'Internal server error removing member.' });
  }
});

module.exports = router;
