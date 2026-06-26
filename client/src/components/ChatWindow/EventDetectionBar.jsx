import React, { useState } from 'react';
import EventModal from './EventModal';
import './EventDetectionBar.css';

/**
 * EventDetectionBar
 * Props:
 *   - message       : the message object
 *   - conversationId: the conversation id
 *   - detection     : { suggestedTitle, suggestedDate, suggestedTime } (passed from parent)
 *   - onEventCreated: callback when an event is saved
 */
export default function EventDetectionBar({ message, conversationId, detection, onEventCreated }) {
  const dismissKey = `zynk_event_dismissed_${message.id}`;
  const [dismissed, setDismissed] = useState(() => !!localStorage.getItem(dismissKey));
  const [showModal, setShowModal] = useState(false);

  // detection is passed as a prop — no localStorage read needed here
  if (dismissed || !detection) return null;

  const handleDismiss = (e) => {
    e.stopPropagation();
    localStorage.setItem(dismissKey, '1');
    setDismissed(true);
  };

  return (
    <>
      <div className="event-detection-bar">
        <div className="event-detection-icon">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/>
          </svg>
        </div>
        <div className="event-detection-content">
          <span className="event-detection-label">Looks like a plan!</span>
          <span className="event-detection-preview">
            {detection.suggestedDate && (
              <>{formatDetectedDate(detection.suggestedDate)}</>
            )}
            {detection.suggestedTime && (
              <> · {formatDetectedTime(detection.suggestedTime)}</>
            )}
          </span>
        </div>
        <div className="event-detection-actions">
          <button
            className="event-detection-create"
            onClick={(e) => { e.stopPropagation(); setShowModal(true); }}
          >
            Create Event
          </button>
          <button className="event-detection-dismiss" onClick={handleDismiss} title="Dismiss">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
      </div>

      {showModal && (
        <EventModal
          conversationId={conversationId}
          initialData={{
            title: detection.suggestedTitle || '',
            eventDate: detection.suggestedDate || '',
            eventTime: detection.suggestedTime || '',
            location: '',
            notes: '',
            messageId: message.id,
          }}
          onSaved={(event) => {
            localStorage.setItem(dismissKey, '1');
            setDismissed(true);
            setShowModal(false);
            onEventCreated && onEventCreated(event);
          }}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

function formatDetectedDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatDetectedTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
