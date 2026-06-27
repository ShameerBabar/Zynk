import React from 'react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { formatRelativeTime } from '../../utils/formatTime';
import { getFileUrl } from '../../utils/constants';
import { useAuth } from '../../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';

export default function ChatListItem({ conversation, isSelected, onClick, onContextMenu }) {
  const { user: currentUser } = useAuth();
  const isPrivate = conversation.type === 'private';
  const otherUser = conversation.other_user || conversation.otherUser;
  
  const isSelf = isPrivate && (otherUser?.id === currentUser?.id || otherUser?.is_self);
  const activeUser = isSelf ? currentUser : otherUser;
  const name = isPrivate ? (isSelf ? 'You (Message yourself)' : activeUser?.display_name || activeUser?.username) : conversation.name;
  const avatar = getFileUrl(isPrivate ? activeUser?.avatar_url : conversation.avatar_url);
  
  const isOnline = useOnlineStatus(isPrivate && !isSelf ? activeUser?.id : null);
  
  const lastMsg = conversation.last_message || conversation.lastMessage;
  const unreadCount = conversation.unread_count !== undefined ? conversation.unread_count : conversation.unreadCount;
  
  let preview = lastMsg?.content || '';
  if (lastMsg?.is_deleted) {
    preview = '🗑 This message was deleted';
  } else if (lastMsg?.type === 'image') {
    preview = '📷 Image';
  } else if (lastMsg?.type === 'video') {
    preview = '🎥 Video';
  } else if (lastMsg?.type === 'audio') {
    preview = '🎵 Voice Message';
  } else if (lastMsg?.type === 'file') {
    preview = '📎 File';
  }

  const pinColorValue = conversation.pinned_color?.startsWith('#') 
    ? conversation.pinned_color 
    : `var(--pinned-${conversation.pinned_color || 'gold'})`;

  const pinnedStyle = conversation.is_pinned ? {
    border: `2px solid ${pinColorValue}`,
    borderRadius: 'var(--radius-md)',
    margin: '4px',
    background: isSelected ? 'var(--bg-active)' : 'rgba(255, 255, 255, 0.02)'
  } : {};

  return (
    <div 
      onClick={onClick}
      onContextMenu={(e) => onContextMenu && onContextMenu(e, conversation)}
      style={{
        display: 'flex',
        padding: '16px',
        cursor: 'pointer',
        background: isSelected ? 'var(--bg-active)' : 'transparent',
        borderBottom: '1px solid var(--border-color)',
        ...pinnedStyle
      }}
      className="interactive"
    >
      <div style={{ position: 'relative', marginRight: '16px' }}>
        <div className="user-avatar-mini" style={{ width: '50px', height: '50px', boxShadow: 'var(--shadow-sm)' }}>
          {avatar ? <img src={avatar} /> : <div className="avatar-placeholder">{name?.[0]?.toUpperCase()}</div>}
        </div>
        {isPrivate && isOnline && (
          <div style={{
            position: 'absolute', bottom: '2px', right: '2px',
            width: '14px', height: '14px', borderRadius: '50%',
            background: 'var(--online-color)', border: '2px solid var(--bg-sidebar)',
            animation: 'pulse-online 2s infinite'
          }}></div>
        )}
      </div>
      
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
          <span style={{ fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {name}
            {Boolean(conversation.is_pinned) && (
              <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" style={{ color: pinColorValue }}>
                <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
              </svg>
            )}
          </span>
          <span style={{ fontSize: 'var(--fs-xs)', color: unreadCount ? 'var(--unread-badge)' : 'var(--text-secondary)', marginLeft: '10px', whiteSpace: 'nowrap' }}>
            {formatRelativeTime(lastMsg?.created_at)}
          </span>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ 
            fontSize: 'var(--fs-sm)', 
            color: unreadCount ? 'var(--text-primary)' : 'var(--text-secondary)', 
            fontWeight: unreadCount ? '600' : 'normal',
            whiteSpace: 'nowrap', 
            overflow: 'hidden', 
            textOverflow: 'ellipsis', 
            fontStyle: lastMsg?.is_deleted ? 'italic' : 'normal' 
          }}>
            {preview}
          </span>
          <AnimatePresence mode="popLayout">
            {unreadCount > 0 && (
              <motion.span 
                key={unreadCount}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                style={{
                  background: 'var(--unread-badge)', color: '#0F172A',
                  fontSize: '11px', fontWeight: 'bold', padding: '3px 8px',
                  borderRadius: '12px', marginLeft: '10px',
                  boxShadow: 'var(--shadow-glow)'
                }}>
                {unreadCount}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
