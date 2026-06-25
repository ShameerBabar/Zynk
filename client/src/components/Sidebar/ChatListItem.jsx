import React from 'react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { formatRelativeTime } from '../../utils/formatTime';
import { getFileUrl } from '../../utils/constants';
import { useAuth } from '../../context/AuthContext';

export default function ChatListItem({ conversation, isSelected, onClick }) {
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
  return (
    <div 
      onClick={onClick}
      style={{
        display: 'flex',
        padding: '12px 16px',
        cursor: 'pointer',
        background: isSelected ? 'var(--bg-active)' : 'transparent',
        borderBottom: '1px solid var(--border-color)'
      }}
      className="hover-bg"
    >
      <div style={{ position: 'relative', marginRight: '15px' }}>
        <div className="user-avatar-mini" style={{ width: '48px', height: '48px' }}>
          {avatar ? <img src={avatar} /> : <div className="avatar-placeholder">{name?.[0]?.toUpperCase()}</div>}
        </div>
        {isPrivate && isOnline && (
          <div style={{
            position: 'absolute', bottom: '2px', right: '2px',
            width: '12px', height: '12px', borderRadius: '50%',
            background: 'var(--online-color)', border: '2px solid var(--bg-sidebar)'
          }}></div>
        )}
      </div>
      
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
          <span style={{ fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {name}
          </span>
          <span style={{ fontSize: 'var(--fs-xs)', color: unreadCount ? 'var(--unread-badge)' : 'var(--text-secondary)', marginLeft: '10px', whiteSpace: 'nowrap' }}>
            {formatRelativeTime(lastMsg?.created_at)}
          </span>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontStyle: lastMsg?.is_deleted ? 'italic' : 'normal' }}>
            {preview}
          </span>
          {unreadCount > 0 && (
            <span style={{
              background: 'var(--unread-badge)', color: 'white',
              fontSize: '10px', fontWeight: 'bold', padding: '2px 6px',
              borderRadius: '10px', marginLeft: '10px'
            }}>
              {unreadCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
