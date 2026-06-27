import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocketContext } from '../../context/SocketContext';
import { formatMessageTime } from '../../utils/formatTime';
import { getFileUrl } from '../../utils/constants';
import VoiceMessagePlayer from './VoiceMessagePlayer';
import PollBubble from './PollBubble';
import EventBubble from './EventBubble';
import EventDetectionBar from './EventDetectionBar';
import { showToast } from '../Common/Toast';
import { post } from '../../utils/api';
import { detectEvent } from '../../utils/detectEvent';
import './MessageBubble.css';

export default function MessageBubble({ message, isGroup, isSelf, onDeleteForMe, searchQuery = '', event = null, onEventCreated, onEventUpdated, onForward }) {
  // Highlight all occurrences of searchQuery inside text
  const HighlightedText = ({ text, query }) => {
    if (!query || !text) return <>{text}</>;
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase()
            ? <mark key={i} style={{
                background: 'rgba(255, 214, 0, 0.55)',
                color: 'inherit',
                borderRadius: '3px',
                padding: '0 1px',
                fontWeight: 600,
              }}>{part}</mark>
            : part
        )}
      </>
    );
  };
  const { user } = useAuth();
  const { deleteMessage, editMessage } = useSocketContext();

  // Detect event info from message text (memoised so it only re-runs when message content changes)
  const detectionResult = useMemo(() => {
    if (message.type !== 'text' || !message.content || message.is_deleted === 1 || event) return null;
    const result = detectEvent(message.content);
    return result.detected ? result : null;
  }, [message.id, message.content, message.type, message.is_deleted, event]);
  const isMine = message.sender_id === user.id;
  const isDeleted = message.is_deleted === 1;

  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [isEditing, setIsEditing] = useState(false);
  const [editVal, setEditVal] = useState(message.content || '');

  useEffect(() => {
    const handleCloseMenu = () => setShowMenu(false);
    if (showMenu) {
      window.addEventListener('click', handleCloseMenu);
      window.addEventListener('contextmenu', handleCloseMenu);
      window.addEventListener('close-all-menus', handleCloseMenu);
    }
    return () => {
      window.removeEventListener('click', handleCloseMenu);
      window.removeEventListener('contextmenu', handleCloseMenu);
      window.removeEventListener('close-all-menus', handleCloseMenu);
    };
  }, [showMenu]);

  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Dispatch event to close any other open menus
    window.dispatchEvent(new Event('close-all-menus'));
    
    let x = e.clientX;
    let y = e.clientY;
    
    // Adjust position if it would overflow the screen
    if (window.innerHeight - y < 240) {
      y = Math.max(10, y - 240); // Shift upwards, ensuring it doesn't go off-screen top
    }
    if (window.innerWidth - x < 180) {
      x = Math.max(10, x - 180); // Shift leftwards
    }

    setShowMenu(true);
    setMenuPosition({ x, y });
  };



  const handleCopy = () => {
    navigator.clipboard.writeText(message.content || '');
    showToast('Message copied');
  };

  const handleVote = async (pollId, optionIds) => {
    try {
      await post(`/polls/${pollId}/vote`, { optionIds });
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleSaveEdit = () => {
    if (!editVal.trim()) return;
    editMessage(message.id, message.conversation_id, editVal);
    setIsEditing(false);
  };

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    }
  };

  return (
    <div className={`message-row ${isMine ? 'mine' : 'theirs'}`}>
      <div 
        className={`message-bubble ${isMine ? 'sent' : 'received'}`}
        onContextMenu={handleContextMenu}
        style={{ cursor: 'pointer' }}
      >
        {!isMine && isGroup && !isDeleted && (
          <div className="sender-name" style={{ color: `hsl(${parseInt(message.sender_id.substring(0,4), 16) % 360}, 70%, 60%)` }}>
            {message.sender?.display_name || 'User'}
          </div>
        )}
        
        <div className="message-content">
          {isDeleted ? (
            <span style={{ fontStyle: 'italic', opacity: 0.75, display: 'flex', alignItems: 'center' }}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{ verticalAlign: 'middle', marginRight: '4px' }}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.14 12.73l-1.41 1.41L12 13.41l-2.73 2.73-1.41-1.41L10.59 12 7.86 9.27l1.41-1.41L12 10.59l2.73-2.73 1.41 1.41L13.41 12l2.73 2.73z"></path></svg>
              This message was deleted
            </span>
          ) : (
            <>
              {message.type === 'image' && message.file_url && (
                <div className="message-image">
                  <img src={getFileUrl(message.file_url)} alt="Shared image" />
                </div>
              )}
              {message.type === 'video' && message.file_url && (
                <div className="message-video">
                  <video src={getFileUrl(message.file_url)} controls />
                </div>
              )}
              {message.type === 'file' && message.file_url && (
                <a href={getFileUrl(message.file_url)} download className="message-file">
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"></path></svg>
                  <span>{message.file_name}</span>
                </a>
              )}
              {message.type === 'audio' && message.file_url && (
                <VoiceMessagePlayer 
                  src={getFileUrl(message.file_url)} 
                  durationProp={message.content ? parseInt(message.content, 10) : 0} 
                />
              )}
              {message.type === 'poll' && message.poll && (
                <PollBubble 
                  poll={message.poll} 
                  currentUserId={user.id} 
                  onVote={handleVote}
                />
              )}
              {message.type !== 'audio' && message.type !== 'poll' && message.content && (
                isEditing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', marginTop: '4px' }} onClick={e => e.stopPropagation()}>
                    <textarea
                      value={editVal}
                      onChange={(e) => setEditVal(e.target.value)}
                      onKeyDown={handleEditKeyDown}
                      style={{
                        background: 'var(--bg-input)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--accent-primary)',
                        borderRadius: '6px',
                        padding: '6px',
                        resize: 'none',
                        minWidth: '200px',
                        maxWidth: '100%',
                        fontFamily: 'inherit',
                        fontSize: 'var(--fs-base)',
                        outline: 'none'
                      }}
                      rows={2}
                      autoFocus
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setIsEditing(false); }}
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--border-light)',
                          color: 'var(--text-secondary)',
                          padding: '4px 12px',
                          borderRadius: '12px',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleSaveEdit(); }}
                        style={{
                          background: 'var(--accent-primary)',
                          border: 'none',
                          color: 'white',
                          padding: '4px 12px',
                          borderRadius: '12px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 'bold'
                        }}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <span><HighlightedText text={message.content} query={searchQuery} /></span>
                )
              )}
            </>
          )}
          {/* Confirmed event bubble — shown instead of detection bar once event is created */}
          {event && message.type === 'text' && (
            <EventBubble event={event} onUpdated={onEventUpdated} />
          )}
        </div>
        
        <div className="message-meta">
          <span className="message-time">{formatMessageTime(message.created_at)}</span>
          {isMine && !isDeleted && (
            <span className={`message-status ${message.status === 'read' || isSelf ? 'read' : ''}`}>
              {message.status === 'read' || message.status === 'delivered' || isSelf ? (
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M0.5 12l1.5-1.5L7 15 19.5 2.5l1.5 1.5L7 18z" />
                  <path d="M5.5 12l1.5-1.5L12 15 24.5 2.5l1.5 1.5L12 18z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"></path>
                </svg>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Event detection suggestion bar — only for text messages without a confirmed event */}
      {detectionResult && !event && isMine && (
        <EventDetectionBar
          message={message}
          conversationId={message.conversation_id}
          detection={detectionResult}
          onEventCreated={onEventCreated}
        />
      )}

      {showMenu && createPortal(
        <div 
          className="context-menu"
          onClick={(e) => e.stopPropagation()}
          style={{
            top: `${menuPosition.y}px`,
            left: `${menuPosition.x}px`
          }}
        >
          {message.type === 'text' && !isDeleted && isMine && (
            <button 
              onClick={() => { setIsEditing(true); setShowMenu(false); }}
              className="context-menu-item"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
              Edit
            </button>
          )}
          {message.content && message.type !== 'audio' && !isDeleted && (
            <button 
              onClick={() => { handleCopy(); setShowMenu(false); }}
              className="context-menu-item"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
              Copy
            </button>
          )}
          {!isDeleted && (
            <button 
              onClick={() => { onForward?.(message); setShowMenu(false); }}
              className="context-menu-item"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg>
              Forward
            </button>
          )}
          {isMine && !isDeleted && (
            <button 
              onClick={() => { deleteMessage(message.id, message.conversation_id); setShowMenu(false); }}
              className="context-menu-item danger"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
              Delete for Everyone
            </button>
          )}
          <button 
            onClick={() => { onDeleteForMe(message.id); setShowMenu(false); }}
            className="context-menu-item"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            Delete for Me
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
