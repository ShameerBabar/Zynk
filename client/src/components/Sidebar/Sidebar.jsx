import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocketContext } from '../../context/SocketContext';
import GlobalSearch from './GlobalSearch';
import ChatList from './ChatList';
import { getFileUrl } from '../../utils/constants';
import { get } from '../../utils/api';
import { subscribeToPush, unsubscribeFromPush } from '../../utils/pushNotifications';
import './Sidebar.css';

export default function Sidebar({ 
  conversations, 
  selectedId, 
  onSelect, 
  onOpenSettings,
  onOpenProfile,
  onNewGroup,
  onOpenNewChatPanel,
  onOpenFriendsPanel,
  onOpenEventsPanel,
  onNewChat,
  onConversationUpdated
}) {
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
        <div className="user-avatar-mini" onClick={onOpenProfile} style={{cursor: 'pointer'}}>
          {user?.avatar_url ? (
            <img src={getFileUrl(user.avatar_url)} alt="Profile" />
          ) : (
            <div className="avatar-placeholder">{user?.display_name?.[0]?.toUpperCase() || user?.username?.[0]?.toUpperCase()}</div>
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
            <span className="icon-label">Friends</span>
          </button>

          {/* New Chat — chat bubble */}
          <button onClick={onOpenNewChatPanel} title="New Chat">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
              <path d="M13 11h-2V9h-2v2H7v2h2v2h2v-2h2z"/>
            </svg>
            <span className="icon-label">Chat</span>
          </button>

          {/* Events - calendar icon */}
          <button onClick={onOpenEventsPanel} title="Events & Polls">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM9 14H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2zm-8 4H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2z"/>
            </svg>
            <span className="icon-label">Events</span>
          </button>


          {/* New Group — multiple people */}
          <button onClick={onNewGroup} title="New Group">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M16.5 12c1.38 0 2.49-1.12 2.49-2.5S17.88 7 16.5 7C15.12 7 14 8.12 14 9.5s1.12 2.5 2.5 2.5zm-9 0C8.88 12 10 10.88 10 9.5S8.88 7 7.5 7C6.12 7 5 8.12 5 9.5S6.12 12 7.5 12zM7.5 14c-1.83 0-5.5.92-5.5 2.75V18h11v-1.25C13 14.92 9.33 14 7.5 14zm9 0c-.23 0-.49.01-.76.03.91.66 1.26 1.31 1.26 2.22V18H22v-1.25C22 14.92 18.33 14 16.5 14z"/>
            </svg>
            <span className="icon-label">Group</span>
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
            <span className="icon-label">Alerts</span>
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

          {/* Settings - cog icon */}
          <button onClick={onOpenSettings} title="Settings">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.06-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.73,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.06,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.43-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.49-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
            </svg>
            <span className="icon-label">Settings</span>
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
        <ChatList conversations={conversations} selectedId={selectedId} onSelect={onSelect} onConversationUpdated={onConversationUpdated} />
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
