import React, { useState, useEffect } from 'react';
import { get } from '../../utils/api';
import { showToast } from '../Common/Toast';
import './EventsPanel.css';

export default function EventsPanel({ onClose, onNavigate }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const data = await get('/events/upcoming');
        setEvents(data.events || []);
      } catch (err) {
        showToast('Failed to load events', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
  }, []);

  // Group by date label
  const grouped = groupByDate(events);

  return (
    <div className="events-panel">
      <div className="events-panel-header">
        <div className="events-panel-title-row">
          <div className="events-panel-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/>
            </svg>
          </div>
          <h2 className="events-panel-title">Upcoming Events</h2>
        </div>
        <button className="events-panel-close" onClick={onClose} title="Close">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>

      <div className="events-panel-body">
        {loading ? (
          <div className="events-panel-spinner">
            <div className="spinner" />
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="events-panel-empty">
            <svg viewBox="0 0 24 24" width="56" height="56" fill="currentColor" className="events-panel-empty-icon">
              <path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/>
            </svg>
            <p className="events-panel-empty-title">No upcoming events</p>
            <p className="events-panel-empty-sub">
              Mention a date in a chat — like "Meeting Friday 8 PM" — to create an event.
            </p>
          </div>
        ) : (
          Object.entries(grouped).map(([label, evs]) => (
            <div key={label} className="events-panel-group">
              <div className="events-panel-group-label">{label}</div>
              {evs.map(ev => (
                <EventCard key={ev.id} event={ev} onNavigate={onNavigate} onClose={onClose} />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function EventCard({ event, onNavigate, onClose }) {
  const going = event.rsvps?.filter(r => r.status === 'going').length || 0;
  const maybe = event.rsvps?.filter(r => r.status === 'maybe').length || 0;

  const formatTime = (hhmm) => {
    if (!hhmm) return null;
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div
      className="events-panel-card"
      onClick={() => { onNavigate && onNavigate(event.conversation_id); onClose && onClose(); }}
    >
      <div className="events-panel-card-accent" />
      <div className="events-panel-card-body">
        <div className="events-panel-card-title">{event.title}</div>
        <div className="events-panel-card-meta">
          {event.event_time && (
            <span className="events-panel-chip time-chip">
              🕐 {formatTime(event.event_time)}
            </span>
          )}
          {event.location && (
            <span className="events-panel-chip loc-chip">
              📍 {event.location}
            </span>
          )}
        </div>
        {(going > 0 || maybe > 0) && (
          <div className="events-panel-card-rsvp">
            {going > 0 && <span className="rsvp-chip going">{going} going</span>}
            {maybe > 0 && <span className="rsvp-chip maybe">{maybe} maybe</span>}
          </div>
        )}
      </div>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" className="events-panel-card-arrow">
        <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/>
      </svg>
    </div>
  );
}

function groupByDate(events) {
  const now = new Date();
  const todayStr = toDateStr(now);
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(now.getDate() + 1);
  const tomorrowStr = toDateStr(tomorrowDate);

  const groups = {};
  events.forEach(ev => {
    let label;
    if (!ev.event_date) {
      label = 'No Date';
    } else if (ev.event_date === todayStr) {
      label = 'Today';
    } else if (ev.event_date === tomorrowStr) {
      label = 'Tomorrow';
    } else {
      const d = new Date(ev.event_date + 'T12:00:00');
      label = d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    }
    if (!groups[label]) groups[label] = [];
    groups[label].push(ev);
  });
  return groups;
}

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
