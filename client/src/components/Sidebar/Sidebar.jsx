import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocketContext } from '../../context/SocketContext';
import SearchBar from './SearchBar';
import ChatList from './ChatList';
import { getFileUrl } from '../../utils/constants';
import { get } from '../../utils/api';
import './Sidebar.css';

export default function Sidebar({ conversations, selectedId, onSelect, onOpenSettings, onNewGroup, onNewChat, onOpenNewChatPanel, onOpenFriendsPanel }) {
  const { user } = useAuth();
  const { socket } = useSocketContext();
  const [pendingRequestCount, setPendingRequestCount] = useState(0);

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
          {/* People / Friends button — replaces old Invite */}
          <button onClick={onOpenFriendsPanel} title="People & Friends" style={{position: 'relative'}}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
            </svg>
            {pendingRequestCount > 0 && (
              <span style={{
                position: 'absolute', top: '2px', right: '2px',
                width: '8px', height: '8px', borderRadius: '50%',
                background: 'var(--accent-danger)', border: '2px solid var(--bg-sidebar)'
              }}/>
            )}
          </button>

          <button onClick={onOpenNewChatPanel} title="New Chat">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19.005 3.175H4.674C3.642 3.175 3 3.789 3 4.821V21.02l3.544-3.514h12.461c1.033 0 2.064-1.06 2.064-2.093V4.821c-.001-1.032-1.032-1.646-2.064-1.646zm-4.989 9.869H7.041V11.1h6.975v1.944zm3-4H7.041V7.1h9.975v1.944z"></path></svg>
          </button>
          <button onClick={onNewGroup} title="New Group">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"></path></svg>
          </button>
          <button onClick={onOpenSettings} title="Settings">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97 0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.38-2.65A.488.488 0 0 0 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1 0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.06.74 1.69.99l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.99l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66z"></path></svg>
          </button>
        </div>
      </div>
      
      <SearchBar onSelectUser={onNewChat} />
      
      <div className="sidebar-list">
        <ChatList conversations={conversations} selectedId={selectedId} onSelect={onSelect} />
      </div>
    </div>
  );
}
