import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocketContext } from '../../context/SocketContext';
import GlobalSearch from './GlobalSearch';
import ChatList from './ChatList';
import { getFileUrl } from '../../utils/constants';
import { get } from '../../utils/api';
import { subscribeToPush, unsubscribeFromPush } from '../../utils/pushNotifications';
import './Sidebar.css';

export default function Sidebar({ conversations, selectedId, onSelect, onOpenSettings, onNewGroup, onNewChat, onOpenNewChatPanel, onOpenFriendsPanel }) {
  const { user, token } = useAuth();
  const { socket } = useSocketContext();
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [notifState, setNotifState] = useState('unknown'); // 'unknown' | 'enabled' | 'disabled' | 'unsupported'
  const [notifLoading, setNotifLoading] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Sync bell state with real permission + FCM token state
  const syncNotifState = () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setNotifState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setNotifState('disabled');
      return;
    }
    if (Notification.permission === 'granted') {
      // Active only if we also have an FCM token stored
      const hasFcmToken = !!localStorage.getItem('zynk_fcm_token');
      setNotifState(hasFcmToken ? 'enabled' : 'disabled');
    } else {
      setNotifState('disabled'); // 'default' = not yet asked
    }
  };

  useEffect(() => {
    syncNotifState();

    // Listen for FCM register/unregister events fired by fcm.js
    const onPushStateChanged = (e) => {
      setNotifState(e.detail.active ? 'enabled' : 'disabled');
    };
    window.addEventListener('zynk:push-state-changed', onPushStateChanged);

    // Listen for browser permission changes (when user answers the prompt)
    let permStatus = null;
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'notifications' }).then(status => {
        permStatus = status;
        status.onchange = syncNotifState;
      }).catch(() => {});
    }

    return () => {
      window.removeEventListener('zynk:push-state-changed', onPushStateChanged);
      if (permStatus) permStatus.onchange = null;
    };
  }, []);

  // Handle bell click — toggle push notifications
  const handleNotifToggle = async () => {
    if (notifState === 'unsupported') return;
    if (notifLoading) return;

    if (notifState === 'enabled') {
      // Turn off
      setNotifLoading(true);
      try {
        await unsubscribeFromPush(token);
        setNotifState('disabled');
      } catch (e) {
        console.error('Unsubscribe failed:', e);
      } finally {
        setNotifLoading(false);
      }
    } else {
      // Turn on — this triggers the browser permission prompt
      setNotifLoading(true);
      try {
        const sub = await subscribeToPush(token);
        setNotifState(sub ? 'enabled' : 'disabled');
      } catch (e) {
        console.error('Subscribe failed:', e);
        setNotifState('disabled');
      } finally {
        setNotifLoading(false);
      }
    }
  };

  // Fetch pending incoming friend request count
  useEffect(() => {
    const fetchPendingCount = async () => {
      try {
        const data = await get('/friends/requests');
        setPendingRequestCount((data.incoming || []).length);
      } catch (_) {}
    };
    fetchPendingCount();
  }, []);

  // Real-time updates for incoming requests
  useEffect(() => {
    if (!socket) return;
    const handleNewRequest = () => setPendingRequestCount(prev => prev + 1);
    const handleAccepted = () => setPendingRequestCount(prev => Math.max(0, prev - 1));
    socket.on('friend_request_received', handleNewRequest);
    socket.on('friend_request_accepted', handleAccepted);
    return () => {
      socket.off('friend_request_received', handleNewRequest);
      socket.off('friend_request_accepted', handleAccepted);
    };
  }, [socket]);

  const notifTitle = notifState === 'enabled'
    ? 'Notifications ON – click to disable'
    : notifState === 'disabled'
    ? 'Notifications OFF – click to enable'
    : notifState === 'unsupported'
    ? 'Notifications not supported in this browser'
    : 'Notifications';

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="user-avatar-mini" onClick={onOpenSettings} style={{cursor: 'pointer'}}>
          {user?.avatar_url ? (
            <img src={getFileUrl(user.avatar_url)} alt="Profile" />
          ) : (
            <div className="avatar-placeholder">{user?.display_name?.[0]?.toUpperCase()}</div>
          )}
        </div>
        
        <div className="sidebar-actions">

          {/* People / Friends — person with checkmark */}
          <button onClick={onOpenFriendsPanel} title="People & Friends" style={{position: 'relative'}}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M9 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v1h16v-1c0-2.66-5.33-4-8-4z"/>
              <path d="M14.5 11l3.5 3.5 5-5-1.4-1.4L18 11.7l-2.1-2.1z"/>
            </svg>
            {pendingRequestCount > 0 && (
              <span style={{
                position: 'absolute', top: '2px', right: '2px',
                width: '8px', height: '8px', borderRadius: '50%',
                background: 'var(--accent-danger)', border: '2px solid var(--bg-sidebar)'
              }}/>
            )}
          </button>

          {/* New Chat — chat bubble */}
          <button onClick={onOpenNewChatPanel} title="New Chat">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
              <path d="M13 11h-2V9h-2v2H7v2h2v2h2v-2h2z"/>
            </svg>
          </button>

          {/* New Group — multiple people */}
          <button onClick={onNewGroup} title="New Group">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M16.5 12c1.38 0 2.49-1.12 2.49-2.5S17.88 7 16.5 7C15.12 7 14 8.12 14 9.5s1.12 2.5 2.5 2.5zm-9 0C8.88 12 10 10.88 10 9.5S8.88 7 7.5 7C6.12 7 5 8.12 5 9.5S6.12 12 7.5 12zM7.5 14c-1.83 0-5.5.92-5.5 2.75V18h11v-1.25C13 14.92 9.33 14 7.5 14zm9 0c-.23 0-.49.01-.76.03.91.66 1.26 1.31 1.26 2.22V18H22v-1.25C22 14.92 18.33 14 16.5 14z"/>
            </svg>
          </button>

          {/* Notifications Bell */}
          <button
            onClick={handleNotifToggle}
            title={notifTitle}
            disabled={notifState === 'unsupported' || notifLoading}
            style={{ position: 'relative', opacity: notifState === 'unsupported' ? 0.4 : 1 }}
          >
            {notifState === 'enabled' ? (
              /* Bell with slash = enabled (click to disable) */
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
              </svg>
            ) : (
              /* Bell with X = disabled (click to enable) */
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" style={{opacity: 0.45}}>
                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
                <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="2"/>
              </svg>
            )}
            {notifLoading && (
              <span style={{
                position: 'absolute', inset: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.4)', borderRadius: '4px'
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.3"/>
                  <path d="M12 2a10 10 0 0 1 10 10">
                    <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/>
                  </path>
                </svg>
              </span>
            )}
          </button>

          {/* Settings — gear */}
          <button onClick={onOpenSettings} title="Settings">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97 0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.38-2.65A.488.488 0 0 0 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1 0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.06.74 1.69.99l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.99l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66z"/>
            </svg>
          </button>

        </div>
      </div>
      
      <div className="search-container" style={{ padding: '10px 20px' }}>
        <div className="search-input-wrapper" onClick={() => setIsSearchOpen(true)} style={{ cursor: 'text' }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          <div style={{ color: 'var(--text-secondary)', fontSize: '15px', flex: 1, padding: '8px 0' }}>Search all conversations...</div>
        </div>
      </div>
      
      <div className="sidebar-list">
        <ChatList conversations={conversations} selectedId={selectedId} onSelect={onSelect} />
      </div>

      {isSearchOpen && (
        <GlobalSearch 
          onClose={() => setIsSearchOpen(false)} 
          onSelectUser={(u) => { setIsSearchOpen(false); onNewChat(u); }}
          onSelectMessage={(convId, msgId) => { setIsSearchOpen(false); onSelect(convId, msgId); }}
        />
      )}
    </div>
  );
}
