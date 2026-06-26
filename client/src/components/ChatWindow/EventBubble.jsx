import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { post } from '../../utils/api';
import { getFileUrl } from '../../utils/constants';
import { showToast } from '../Common/Toast';
import EventModal from './EventModal';
import './EventBubble.css';

export default function EventBubble({ event: initialEvent, onUpdated }) {
  const { user } = useAuth();
  const [event, setEvent] = useState(initialEvent);
  const [showEdit, setShowEdit] = useState(false);

  React.useEffect(() => {
    setEvent(initialEvent);
  }, [initialEvent]);

  const myRsvp = event.rsvps?.find(r => r.user_id === user.id)?.status || null;
  const going    = event.rsvps?.filter(r => r.status === 'going')     || [];
  const maybe    = event.rsvps?.filter(r => r.status === 'maybe')     || [];
  const notGoing = event.rsvps?.filter(r => r.status === 'not_going') || [];
  const isCreator = event.creator_id === user.id;

  const handleRsvp = async (status) => {
    try {
      const result = await post(`/events/${event.id}/rsvp`, { status });
      setEvent(result.event);
      onUpdated && onUpdated(result.event);
    } catch (err) {
      showToast(err.message || 'Failed to RSVP', 'error');
    }
  };

  const formatDate = (iso) => {
    if (!iso) return null;
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTime = (hhmm) => {
    if (!hhmm) return null;
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <>
      <div className="event-bubble">
        <div className="event-bubble-header">
          <div className="event-bubble-header-icon">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/>
            </svg>
          </div>
          <span className="event-bubble-tag">EVENT</span>
          {isCreator && (
            <button className="event-bubble-edit-btn" onClick={() => setShowEdit(true)} title="Edit event">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
              </svg>
            </button>
          )}
        </div>

        <div className="event-bubble-title">{event.title}</div>

        <div className="event-bubble-meta">
          {(event.event_date || event.event_time) && (
            <div className="event-bubble-meta-row">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style={{ flexShrink: 0 }}>
                <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/>
              </svg>
              <span>
                {formatDate(event.event_date)}
                {event.event_date && event.event_time && ' · '}
                {formatTime(event.event_time)}
              </span>
            </div>
          )}
          {event.location && (
            <div className="event-bubble-meta-row">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style={{ flexShrink: 0 }}>
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
              <span>{event.location}</span>
            </div>
          )}
          {event.notes && (
            <div className="event-bubble-notes">{event.notes}</div>
          )}
        </div>

        {/* RSVP rows with avatar stacks */}
        <div className="event-bubble-rsvp">
          <RsvpRow
            label="✓ Going"
            status="going"
            users={going}
            isActive={myRsvp === 'going'}
            colorClass="going"
            onRsvp={() => handleRsvp('going')}
          />
          <RsvpRow
            label="? Maybe"
            status="maybe"
            users={maybe}
            isActive={myRsvp === 'maybe'}
            colorClass="maybe"
            onRsvp={() => handleRsvp('maybe')}
          />
          <RsvpRow
            label="✗ Can't Go"
            status="not_going"
            users={notGoing}
            isActive={myRsvp === 'not_going'}
            colorClass="not-going"
            onRsvp={() => handleRsvp('not_going')}
          />
        </div>
      </div>

      {showEdit && (
        <EventModal
          conversationId={event.conversation_id}
          existingEvent={event}
          onSaved={(updated) => {
            setEvent(updated);
            setShowEdit(false);
            onUpdated && onUpdated(updated);
          }}
          onClose={() => setShowEdit(false)}
        />
      )}
    </>
  );
}

function RsvpRow({ label, users, isActive, colorClass, onRsvp }) {
  const MAX_AVATARS = 4;
  const count = users.length;

  return (
    <div className={`event-rsvp-row ${colorClass} ${isActive ? 'active' : ''}`} onClick={onRsvp}>
      <span className="event-rsvp-label">
        {label}{count > 0 ? ` (${count})` : ''}
      </span>
      {count > 0 && (
        <div className="event-rsvp-avatars">
          {users.slice(0, MAX_AVATARS).map((r) => (
            <div
              key={r.user_id}
              className="event-rsvp-avatar"
              title={r.display_name || r.username}
            >
              {r.avatar_url ? (
                <img src={getFileUrl(r.avatar_url)} alt={r.display_name || r.username} />
              ) : (
                <span>{(r.display_name || r.username || '?')[0].toUpperCase()}</span>
              )}
            </div>
          ))}
          {count > MAX_AVATARS && (
            <div className="event-rsvp-avatar event-rsvp-avatar-more">
              +{count - MAX_AVATARS}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
