const admin = require('firebase-admin');

function startEventReminders(db, io, pushQueue) {
  // Check every 60 seconds
  setInterval(() => {
    try {
      const now = new Date();
      // We want to notify 30 minutes before the event
      // So we look for events between now and now + 30 minutes.
      const targetTimeMs = now.getTime() + 30 * 60000;
      
      const events = db.prepare('SELECT * FROM events WHERE reminded = 0').all();
      
      events.forEach(event => {
        if (!event.event_date || !event.event_time) return;
        
        // Parse event date and time
        // event.event_date is 'YYYY-MM-DD', event.event_time is 'HH:mm'
        const [year, month, day] = event.event_date.split('-');
        const [hours, minutes] = event.event_time.split(':');
        
        // Construct the Date object in local time
        const eventDateObj = new Date(year, month - 1, day, hours, minutes);
        const eventTimeMs = eventDateObj.getTime();
        
        // Check if event is within the next 30 minutes
        // AND check if the event hasn't already passed (e.g. from server downtime)
        if (eventTimeMs > now.getTime() && eventTimeMs <= targetTimeMs) {
          
          // Time to send reminders!
          
          // Get conversation members
          const members = db.prepare(`
            SELECT user_id 
            FROM conversation_members 
            WHERE conversation_id = ?
          `).all(event.conversation_id);
          
          // Get RSVPs to filter out 'declined'
          const rsvps = db.prepare(`
            SELECT user_id, status 
            FROM event_rsvps 
            WHERE event_id = ?
          `).all(event.id);
          
          const rsvpMap = {};
          rsvps.forEach(r => { rsvpMap[r.user_id] = r.status; });
          
          // Determine who to notify
          const usersToNotify = members.filter(m => {
            const status = rsvpMap[m.user_id];
            // Don't notify if they explicitly declined
            if (status === 'declined') return false;
            return true;
          });
          
          const payload = {
            title: 'Event Reminder',
            body: `"${event.title}" is starting in 30 minutes!`,
            data: {
              type: 'event',
              conversationId: event.conversation_id,
              eventId: event.id
            }
          };

          // Push to pushQueue and Socket
          usersToNotify.forEach(u => {
            pushQueue.push({
              targetUserId: u.user_id,
              payload: payload,
              retries: 0
            });
            
            // In-app notification for online users
            const userRec = db.prepare('SELECT is_online FROM users WHERE id = ?').get(u.user_id);
            if (userRec && userRec.is_online === 1 && io) {
              io.to(u.user_id).emit('notification', payload);
            }
          });
          
          // Mark as reminded
          db.prepare('UPDATE events SET reminded = 1 WHERE id = ?').run(event.id);
          console.log(`[REMINDERS] Dispatched 30-min reminders for event: ${event.title}`);
        } else if (eventTimeMs <= now.getTime()) {
          // Event is in the past, silently mark as reminded so we don't check it again
          db.prepare('UPDATE events SET reminded = 1 WHERE id = ?').run(event.id);
        }
      });
    } catch (err) {
      console.error('[REMINDERS] Error processing event reminders:', err);
    }
  }, 60000); // 1 minute
}

module.exports = { startEventReminders };
