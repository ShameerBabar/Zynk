import React, { useState, useEffect } from 'react';
import { post, put } from '../../utils/api';
import { showToast } from '../Common/Toast';
import './EventModal.css';

export default function EventModal({ conversationId, initialData = {}, existingEvent = null, onSaved, onClose }) {
  const isEdit = !!existingEvent;

  const [title, setTitle] = useState(isEdit ? existingEvent.title : (initialData.title || ''));
  const [eventDate, setEventDate] = useState(isEdit ? (existingEvent.event_date || '') : (initialData.eventDate || ''));
  const [eventTime, setEventTime] = useState(isEdit ? (existingEvent.event_time || '') : (initialData.eventTime || ''));
  const [location, setLocation] = useState(isEdit ? (existingEvent.location || '') : (initialData.location || ''));
  const [notes, setNotes] = useState(isEdit ? (existingEvent.notes || '') : (initialData.notes || ''));
  const [saving, setSaving] = useState(false);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!title.trim()) return showToast('Title is required', 'error');
    setSaving(true);
    try {
      let result;
      if (isEdit) {
        result = await put(`/events/${existingEvent.id}`, {
          title: title.trim(),
          eventDate: eventDate || null,
          eventTime: eventTime || null,
          location: location.trim() || null,
          notes: notes.trim() || null,
        });
      } else {
        result = await post('/events', {
          conversationId,
          messageId: initialData.messageId || null,
          title: title.trim(),
          eventDate: eventDate || null,
          eventTime: eventTime || null,
          location: location.trim() || null,
          notes: notes.trim() || null,
        });
      }
      onSaved && onSaved(result.event);
      showToast(isEdit ? 'Event updated!' : 'Event created!');
    } catch (err) {
      showToast(err.message || 'Failed to save event', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="event-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="event-modal">
        <div className="event-modal-header">
          <div className="event-modal-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/>
            </svg>
          </div>
          <h3 className="event-modal-title">{isEdit ? 'Edit Event' : 'Create Event'}</h3>
          <button className="event-modal-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <form className="event-modal-form" onSubmit={handleSave}>
          <div className="event-modal-field">
            <label className="event-modal-label">Title *</label>
            <input
              className="event-modal-input"
              type="text"
              placeholder="What's the plan?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="event-modal-row">
            <div className="event-modal-field">
              <label className="event-modal-label">Date</label>
              <input
                className="event-modal-input"
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
              />
            </div>
            <div className="event-modal-field">
              <label className="event-modal-label">Time</label>
              <input
                className="event-modal-input"
                type="time"
                value={eventTime}
                onChange={(e) => setEventTime(e.target.value)}
              />
            </div>
          </div>

          <div className="event-modal-field">
            <label className="event-modal-label">Location</label>
            <input
              className="event-modal-input"
              type="text"
              placeholder="Where? (optional)"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>

          <div className="event-modal-field">
            <label className="event-modal-label">Notes</label>
            <textarea
              className="event-modal-input event-modal-textarea"
              placeholder="Any extra details? (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          <div className="event-modal-footer">
            <button type="button" className="event-modal-btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="event-modal-btn-save" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
