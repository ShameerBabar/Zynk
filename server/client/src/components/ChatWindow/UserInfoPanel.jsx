import React, { useState, useEffect } from 'react';
import { get, put, post, del } from '../../utils/api';
import { showToast } from '../Common/Toast';
import { getFileUrl } from '../../utils/constants';
import { useAuth } from '../../context/AuthContext';
import { useSocketContext } from '../../context/SocketContext';
import { formatLastSeen } from '../../utils/formatTime';

export default function UserInfoPanel({
  conversation,
  otherUser,
  onClose,
  onMuteChange,
  onBlockChange,
  messages = [],
  onOpenThemeModal,
  onOpenWallpaperModal
}) {
  const { user: currentUser } = useAuth();
  const { socket } = useSocketContext();

  const [activeTab, setActiveTab] = useState('info'); // 'info' | 'media'
  const [isMuted, setIsMuted] = useState(conversation.is_muted === 1 || false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockLoading, setBlockLoading] = useState(true);
  const [mediaList, setMediaList] = useState(() =>
    messages.filter(m => m.file_url && !m.is_deleted)
  );

  // Fetch block status on mount
  useEffect(() => {
    if (!otherUser?.id) return;
    get(`/users/${otherUser.id}/block`)
      .then(res => setIsBlocked(res.blocked))
      .catch(() => {})
      .finally(() => setBlockLoading(false));
  }, [otherUser?.id]);

  // Fetch media when switching to media tab
  useEffect(() => {
    if (activeTab === 'media' && mediaList.length === 0) {
      get(`/messages/${conversation.id}/media`)
        .then(res => setMediaList(res.media || []))
        .catch(err => console.error(err));
    }
  }, [activeTab, conversation.id]);

  // Real-time: add new media messages as they arrive
  useEffect(() => {
    if (!socket) return;
    const handler = (msg) => {
      if (msg.conversation_id === conversation.id && msg.file_url) {
        setMediaList(prev => {
          if (prev.find(m => m.id === msg.id)) return prev;
          return [msg, ...prev];
        });
      }
    };
    socket.on('new_message', handler);
    return () => socket.off('new_message', handler);
  }, [socket, conversation.id]);

  // Sync media from updated messages prop
  useEffect(() => {
    if (messages.length > 0) {
      setMediaList(prev => {
        const existingIds = new Set(prev.map(m => m.id));
        const newMedia = messages.filter(m => m.file_url && !m.is_deleted && !existingIds.has(m.id));
        if (newMedia.length > 0) {
          return [...prev, ...newMedia].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        }
        return prev;
      });
    }
  }, [messages]);

  const handleMuteToggle = async () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    try {
      await put(`/messages/${conversation.id}/mute`, { is_muted: newMuted });
      if (onMuteChange) onMuteChange(newMuted);
      showToast(newMuted ? 'Notifications muted' : 'Notifications unmuted', 'success');
    } catch (err) {
      setIsMuted(!newMuted);
      showToast('Failed to change mute settings', 'error');
    }
  };

  const handleBlockToggle = async () => {
    if (blockLoading) return;
    const newBlocked = !isBlocked;
    setBlockLoading(true);
    try {
      if (newBlocked) {
        await post(`/users/${otherUser.id}/block`, {});
        showToast(`${otherUser.display_name || otherUser.username} blocked`, 'success');
      } else {
        await del(`/users/${otherUser.id}/block`);
        showToast(`${otherUser.display_name || otherUser.username} unblocked`, 'success');
      }
      setIsBlocked(newBlocked);
      if (onBlockChange) onBlockChange(newBlocked);
    } catch (err) {
      showToast(err.message || 'Failed to update block status', 'error');
    } finally {
      setBlockLoading(false);
    }
  };

  const displayName = otherUser?.display_name || otherUser?.username || 'Unknown';
  const avatarUrl = getFileUrl(otherUser?.avatar_url);
  const isOnline = otherUser?.is_online;

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.6)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'var(--bg-modal)', borderRadius: 'var(--radius-lg)',
        width: '90%', maxWidth: '420px', maxHeight: '85vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        animation: 'fadeSlideIn 0.2s ease'
      }}>
        {/* Header */}
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '15px' }}>
          {/* Avatar */}
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%',
            background: 'var(--accent-primary)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: 'white', fontWeight: 'bold', fontSize: '26px', flexShrink: 0,
            overflow: 'hidden', position: 'relative'
          }}>
            {avatarUrl
              ? <img src={avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={displayName} />
              : displayName[0]?.toUpperCase()}
            {/* Online dot */}
            {isOnline && (
              <div style={{
                position: 'absolute', bottom: '3px', right: '3px',
                width: '12px', height: '12px', borderRadius: '50%',
                background: 'var(--online-color)', border: '2px solid var(--bg-modal)'
              }} />
            )}
          </div>

          {/* Name + status */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '18px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {displayName}
            </div>
            <div style={{ fontSize: '13px', color: isOnline ? 'var(--online-color)' : 'var(--text-secondary)', marginTop: '3px' }}>
              {isOnline ? 'Online' : formatLastSeen(otherUser?.last_seen)}
            </div>
            {otherUser?.status_text && (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', fontStyle: 'italic', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {otherUser.status_text}
              </div>
            )}
          </div>

          {/* Close */}
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '6px', borderRadius: '50%', fontSize: '22px', lineHeight: 1, flexShrink: 0 }}
            className="hover-bg"
          >×</button>
        </div>

        {/* Mute toggle row */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style={{ color: isMuted ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
              {isMuted
                ? <path d="M4.34 2.93L2.93 4.34 7.29 8.7 7 9H3v6h4l5 5v-6.59l4.18 4.18A6.92 6.92 0 0 1 14 19.7V22a9.16 9.16 0 0 0 4.62-2.34l2.05 2.05 1.41-1.41L4.34 2.93zM19 12c0 .82-.15 1.61-.41 2.34l1.53 1.53c.56-1.17.88-2.48.88-3.87 0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM12 4L9.91 6.09 12 8.18V4zm4.5 8c0-1.77-1-3.29-2.5-4.03v1.79l2.48 2.48c.01-.08.02-.16.02-.24z"/>
                : <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1-3.29-2.5-4.03v8.05c1.5-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
              }
            </svg>
            <span style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>Mute Notifications</span>
          </div>
          <div
            onClick={handleMuteToggle}
            style={{
              width: '40px', height: '22px', borderRadius: '11px',
              background: isMuted ? 'var(--accent-primary)' : 'var(--border-light)',
              position: 'relative', cursor: 'pointer', transition: 'background 0.2s'
            }}
          >
            <div style={{
              position: 'absolute', top: '2px', left: isMuted ? '20px' : '2px',
              width: '18px', height: '18px', borderRadius: '50%', background: 'white',
              transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
            }} />
          </div>
        </div>

        {/* Action Bar (Theme) */}
        <div 
          onClick={onOpenThemeModal}
          className="interactive"
          style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
        >
          <span style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>Chat Theme</span>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{conversation.theme && conversation.theme !== 'default' ? conversation.theme.charAt(0).toUpperCase() + conversation.theme.slice(1) : 'Default'} ›</span>
        </div>

        {/* Action Bar (Wallpaper) */}
        <div 
          onClick={onOpenWallpaperModal}
          className="interactive"
          style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
        >
          <span style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>Chat Wallpaper</span>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{conversation.wallpaper ? 'Custom' : 'Default'} ›</span>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)' }}>
          <button
            onClick={() => setActiveTab('info')}
            style={{
              flex: 1, padding: '12px', background: 'transparent', border: 'none', cursor: 'pointer',
              borderBottom: activeTab === 'info' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              color: activeTab === 'info' ? 'var(--accent-primary)' : 'var(--text-secondary)', fontWeight: 600, fontSize: '14px'
            }}
          >Info</button>
          <button
            onClick={() => setActiveTab('media')}
            style={{
              flex: 1, padding: '12px', background: 'transparent', border: 'none', cursor: 'pointer',
              borderBottom: activeTab === 'media' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              color: activeTab === 'media' ? 'var(--accent-primary)' : 'var(--text-secondary)', fontWeight: 600, fontSize: '14px'
            }}
          >Media</button>
        </div>

        {/* Info Tab */}
        {activeTab === 'info' && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {/* User details */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>About</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {otherUser?.username && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
                      <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
                    </svg>
                    <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>@{otherUser.username}</span>
                  </div>
                )}
                {otherUser?.phone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
                      <path d="M6.62 10.79a15.149 15.149 0 0 0 6.59 6.59l2.2-2.2c.28-.28.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                    </svg>
                    <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{otherUser.phone}</span>
                  </div>
                )}
                {otherUser?.status_text && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style={{ color: 'var(--text-secondary)', flexShrink: 0, marginTop: '2px' }}>
                      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
                    </svg>
                    <span style={{ fontSize: '14px', color: 'var(--text-primary)', fontStyle: 'italic' }}>{otherUser.status_text}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Block section */}
            <div style={{ padding: '16px 20px' }}>
              <button
                onClick={handleBlockToggle}
                disabled={blockLoading}
                style={{
                  width: '100%', padding: '12px 16px',
                  background: isBlocked ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
                  color: '#ef4444',
                  border: `1px solid ${isBlocked ? 'rgba(239,68,68,0.4)' : 'rgba(239,68,68,0.2)'}`,
                  borderRadius: '10px', cursor: blockLoading ? 'not-allowed' : 'pointer',
                  fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: '8px', transition: 'all 0.2s',
                  opacity: blockLoading ? 0.6 : 1
                }}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.68L5.68 16.9C4.63 15.55 4 13.85 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.68L18.32 7.1C19.37 8.45 20 10.15 20 12c0 4.42-3.58 8-8 8z"/>
                </svg>
                {blockLoading ? 'Loading...' : isBlocked ? `Unblock ${displayName}` : `Block ${displayName}`}
              </button>
              {isBlocked && (
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '8px', margin: '8px 0 0 0' }}>
                  You can't send or receive messages from this contact.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Media Tab */}
        {activeTab === 'media' && (
          <div style={{
            flex: 1, overflowY: 'auto', padding: '10px',
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '5px', alignContent: 'start'
          }}>
            {mediaList.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', padding: '30px 20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '14px' }}>
                <svg viewBox="0 0 24 24" width="40" height="40" fill="currentColor" style={{ opacity: 0.3, display: 'block', margin: '0 auto 10px' }}>
                  <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                </svg>
                No media shared yet.
              </div>
            ) : mediaList.map(m => {
              const handleMediaClick = () => {
                onClose();
                setTimeout(() => {
                  const el = document.getElementById(`message-${m.id}`);
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.classList.add('message-highlight-pulse');
                    setTimeout(() => el.classList.remove('message-highlight-pulse'), 2000);
                  }
                }, 200);
              };

              if (m.type === 'image') {
                return (
                  <div key={m.id} onClick={handleMediaClick} style={{ aspectRatio: '1', overflow: 'hidden', borderRadius: '6px', background: 'var(--bg-active)', cursor: 'pointer' }}>
                    <img src={getFileUrl(m.file_url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                  </div>
                );
              } else if (m.type === 'video') {
                return (
                  <div key={m.id} onClick={handleMediaClick} style={{ aspectRatio: '1', overflow: 'hidden', borderRadius: '6px', background: '#000', position: 'relative', cursor: 'pointer' }}>
                    <video src={getFileUrl(m.file_url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                  </div>
                );
              } else {
                return (
                  <div key={m.id} onClick={handleMediaClick} style={{ aspectRatio: '1', overflow: 'hidden', borderRadius: '6px', background: 'var(--bg-active)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px', textAlign: 'center', cursor: 'pointer' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--text-secondary)"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/></svg>
                    <div style={{ fontSize: '9px', marginTop: '4px', wordBreak: 'break-all', color: 'var(--text-secondary)' }}>{m.file_name}</div>
                  </div>
                );
              }
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
