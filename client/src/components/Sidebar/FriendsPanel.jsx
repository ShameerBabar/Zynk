import React, { useState, useEffect, useCallback } from 'react';
import { get, post, del } from '../../utils/api';
import { getFileUrl } from '../../utils/constants';
import { useAuth } from '../../context/AuthContext';
import { useSocketContext } from '../../context/SocketContext';
import { showToast } from '../Common/Toast';
import './FriendsPanel.css';

const TABS = ['Find People', 'Requests', 'Friends'];

export default function FriendsPanel({ onClose, onStartChat }) {
  const { user: currentUser } = useAuth();
  const { socket } = useSocketContext();
  const [activeTab, setActiveTab] = useState(0);

  // Find People state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // Requests state
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(false);

  // Friends state
  const [friends, setFriends] = useState([]);
  const [friendsLoading, setFriendsLoading] = useState(false);

  // Track pending actions per user
  const [actionLoading, setActionLoading] = useState({});

  // ── Fetch Data ──────────────────────────────────────────────────────────
  const fetchRequests = useCallback(async () => {
    setRequestsLoading(true);
    try {
      const data = await get('/friends/requests');
      setIncoming(data.incoming || []);
      setOutgoing(data.outgoing || []);
    } catch (err) {
      console.error('Failed to fetch requests:', err);
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  const fetchFriends = useCallback(async () => {
    setFriendsLoading(true);
    try {
      const data = await get('/friends');
      setFriends(data.friends || []);
    } catch (err) {
      console.error('Failed to fetch friends:', err);
    } finally {
      setFriendsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
    fetchFriends();
  }, []);

  // ── Real-time socket events ──────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const handleRequestReceived = ({ requestId, sender }) => {
      setIncoming(prev => {
        if (prev.some(r => r.id === requestId)) return prev;
        return [{
          id: requestId,
          sender_id: sender.id,
          username: sender.username,
          display_name: sender.display_name,
          avatar_url: sender.avatar_url,
        }, ...prev];
      });
      showToast(`${sender.display_name || sender.username} sent you a friend request`, 'info');
    };

    const handleRequestAccepted = ({ conversation, friendId }) => {
      fetchFriends();
      fetchRequests();
      if (onStartChat && conversation) {
        onStartChat(conversation);
      }
    };

    socket.on('friend_request_received', handleRequestReceived);
    socket.on('friend_request_accepted', handleRequestAccepted);

    return () => {
      socket.off('friend_request_received', handleRequestReceived);
      socket.off('friend_request_accepted', handleRequestAccepted);
    };
  }, [socket, fetchFriends, fetchRequests]);

  // ── Search (debounced) ───────────────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await get(`/users/search?q=${encodeURIComponent(searchQuery.trim())}`);
        setSearchResults(data.users || []);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const setLoading = (id, val) => setActionLoading(prev => ({ ...prev, [id]: val }));

  const sendRequest = async (userId) => {
    setLoading(userId, 'sending');
    try {
      await post(`/friends/request/${userId}`);
      setSearchResults(prev => prev.map(u => u.id === userId ? { ...u, requestSent: true } : u));
      showToast('Friend request sent!', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to send request', 'error');
    } finally {
      setLoading(userId, null);
    }
  };

  const acceptRequest = async (requestId, senderId) => {
    setLoading(requestId, 'accepting');
    try {
      const data = await post(`/friends/accept/${requestId}`);
      setIncoming(prev => prev.filter(r => r.id !== requestId));
      fetchFriends();
      if (data.conversation && onStartChat) {
        onStartChat(data.conversation);
      }
      showToast('Friend request accepted! Conversation started.', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to accept', 'error');
    } finally {
      setLoading(requestId, null);
    }
  };

  const declineRequest = async (requestId) => {
    setLoading(requestId, 'declining');
    try {
      await post(`/friends/decline/${requestId}`);
      setIncoming(prev => prev.filter(r => r.id !== requestId));
      setOutgoing(prev => prev.filter(r => r.id !== requestId));
      showToast('Request declined.', 'info');
    } catch (err) {
      showToast(err.message || 'Failed to decline', 'error');
    } finally {
      setLoading(requestId, null);
    }
  };

  const removeFriend = async (friendId) => {
    setLoading(friendId, 'removing');
    try {
      await del(`/friends/${friendId}`);
      setFriends(prev => prev.filter(f => f.id !== friendId));
      showToast('Friend removed.', 'info');
    } catch (err) {
      showToast(err.message || 'Failed to remove friend', 'error');
    } finally {
      setLoading(friendId, null);
    }
  };

  const startChat = async (friend) => {
    try {
      const data = await post(`/messages/conversations/private/${friend.id}`);
      if (onStartChat) onStartChat(data.conversation);
      onClose();
    } catch (err) {
      showToast('Failed to open chat', 'error');
    }
  };

  // ── Get relationship status — now comes directly from search results ─────────
  // The server JOINs friend_requests and returns relationship inline, so
  // both sides always see the correct state without any timing issues.
  const getRelationshipStatus = (user) => {
    // If the user object has a server-side relationship field, use it
    if (user.relationship) {
      if (user.relationship === 'friend') return 'friend';
      if (user.relationship === 'pending_sent') return 'sent';
      if (user.relationship === 'pending_received') return 'received';
      return 'none';
    }
    // Fallback: check local state (for users found before inline data)
    if (friends.some(f => f.id === user.id)) return 'friend';
    if (outgoing.some(r => r.receiver_id === user.id)) return 'sent';
    if (incoming.some(r => r.sender_id === user.id)) return 'received';
    return 'none';
  };


  const pendingCount = incoming.length;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="friends-panel slide-in-left">
      {/* Header */}
      <div className="friends-panel-header">
        <button onClick={onClose} className="friends-back-btn">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
          </svg>
        </button>
        <span className="friends-panel-title">People</span>
      </div>

      {/* Tabs */}
      <div className="friends-tabs">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            className={`friends-tab ${activeTab === i ? 'active' : ''}`}
            onClick={() => setActiveTab(i)}
          >
            {tab}
            {i === 1 && pendingCount > 0 && (
              <span className="friends-badge">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="friends-panel-body">

        {/* ── TAB 0: Find People ── */}
        {activeTab === 0 && (
          <div className="friends-tab-content">
            <div className="friends-search-box">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                type="text"
                placeholder="Search by name or username..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                autoFocus
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="friends-clear-btn">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}
            </div>

            {searching && (
              <div className="friends-loading">
                <div className="spinner"/>
              </div>
            )}

            {!searching && searchQuery && searchResults.length === 0 && (
              <div className="friends-empty">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="var(--text-secondary)">
                  <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                </svg>
                <p>No users found for "<strong>{searchQuery}</strong>"</p>
              </div>
            )}

            {!searchQuery && (
              <div className="friends-empty">
                <svg viewBox="0 0 24 24" width="64" height="64" fill="var(--text-secondary)" style={{opacity: 0.3}}>
                  <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
                </svg>
                <p>Search for people on Zynk</p>
                <span>Find friends by name or username</span>
              </div>
            )}

            <div className="friends-list">
              {searchResults.map(user => {
                const status = getRelationshipStatus(user);
                const isLoading = actionLoading[user.id];

                return (
                  <div key={user.id} className="friend-item">
                    <div className="friend-avatar">
                      {user.avatar_url
                        ? <img src={getFileUrl(user.avatar_url)} alt="" />
                        : <div className="avatar-placeholder">{(user.display_name?.[0] || user.username?.[0] || '?').toUpperCase()}</div>
                      }
                      {user.is_online === 1 && <span className="friend-online-dot"/>}
                    </div>
                    <div className="friend-info">
                      <span className="friend-name">{user.display_name || user.username}</span>
                      <span className="friend-username">@{user.username}</span>
                      {user.status_text && <span className="friend-status">{user.status_text}</span>}
                    </div>
                    <div className="friend-actions">
                      {status === 'friend' && (
                        <button className="friend-btn friend-btn-msg" onClick={() => startChat(user)}>
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
                          </svg>
                          Message
                        </button>
                      )}
                      {status === 'sent' && (
                        <button className="friend-btn friend-btn-sent" disabled>
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                          </svg>
                          Sent
                        </button>
                      )}
                      {status === 'received' && (
                        <button
                          className="friend-btn friend-btn-accept"
                          onClick={() => {
                            const reqId = user.request_id || (incoming.find(r => r.sender_id === user.id)?.id);
                            if (reqId) acceptRequest(reqId, user.id);
                          }}
                        >
                          Accept
                        </button>
                      )}
                      {status === 'none' && (
                        <button
                          className="friend-btn friend-btn-add"
                          onClick={() => sendRequest(user.id)}
                          disabled={!!isLoading}
                        >
                          {isLoading === 'sending' ? <span className="spinner-sm"/> : (
                            <>
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                                <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                              </svg>
                              Add Friend
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── TAB 1: Requests ── */}
        {activeTab === 1 && (
          <div className="friends-tab-content">
            {requestsLoading ? (
              <div className="friends-loading"><div className="spinner"/></div>
            ) : (
              <>
                {incoming.length > 0 && (
                  <div className="friends-section">
                    <div className="friends-section-label">Incoming ({incoming.length})</div>
                    {incoming.map(req => (
                      <div key={req.id} className="friend-item">
                        <div className="friend-avatar">
                          {req.avatar_url
                            ? <img src={getFileUrl(req.avatar_url)} alt="" />
                            : <div className="avatar-placeholder">{(req.display_name?.[0] || req.username?.[0] || '?').toUpperCase()}</div>
                          }
                        </div>
                        <div className="friend-info">
                          <span className="friend-name">{req.display_name || req.username}</span>
                          <span className="friend-username">@{req.username}</span>
                        </div>
                        <div className="friend-actions">
                          <button
                            className="friend-btn friend-btn-accept"
                            onClick={() => acceptRequest(req.id, req.sender_id)}
                            disabled={!!actionLoading[req.id]}
                          >
                            {actionLoading[req.id] === 'accepting' ? <span className="spinner-sm"/> : 'Accept'}
                          </button>
                          <button
                            className="friend-btn friend-btn-decline"
                            onClick={() => declineRequest(req.id)}
                            disabled={!!actionLoading[req.id]}
                          >
                            {actionLoading[req.id] === 'declining' ? <span className="spinner-sm"/> : 'Decline'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {outgoing.length > 0 && (
                  <div className="friends-section">
                    <div className="friends-section-label">Sent ({outgoing.length})</div>
                    {outgoing.map(req => (
                      <div key={req.id} className="friend-item">
                        <div className="friend-avatar">
                          {req.avatar_url
                            ? <img src={getFileUrl(req.avatar_url)} alt="" />
                            : <div className="avatar-placeholder">{(req.display_name?.[0] || req.username?.[0] || '?').toUpperCase()}</div>
                          }
                        </div>
                        <div className="friend-info">
                          <span className="friend-name">{req.display_name || req.username}</span>
                          <span className="friend-username">@{req.username}</span>
                        </div>
                        <div className="friend-actions">
                          <button
                            className="friend-btn friend-btn-decline"
                            onClick={() => declineRequest(req.id)}
                            disabled={!!actionLoading[req.id]}
                          >
                            {actionLoading[req.id] === 'declining' ? <span className="spinner-sm"/> : 'Cancel'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {incoming.length === 0 && outgoing.length === 0 && (
                  <div className="friends-empty">
                    <svg viewBox="0 0 24 24" width="64" height="64" fill="var(--text-secondary)" style={{opacity: 0.3}}>
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                    </svg>
                    <p>No pending requests</p>
                    <span>Go to Find People to add friends</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── TAB 2: Friends ── */}
        {activeTab === 2 && (
          <div className="friends-tab-content">
            {friendsLoading ? (
              <div className="friends-loading"><div className="spinner"/></div>
            ) : friends.length === 0 ? (
              <div className="friends-empty">
                <svg viewBox="0 0 24 24" width="64" height="64" fill="var(--text-secondary)" style={{opacity: 0.3}}>
                  <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
                </svg>
                <p>No friends yet</p>
                <span>Find people and send friend requests</span>
              </div>
            ) : (
              <div className="friends-list">
                <div className="friends-section-label">{friends.length} Friend{friends.length !== 1 ? 's' : ''}</div>
                {friends.map(friend => (
                  <div key={friend.id} className="friend-item">
                    <div className="friend-avatar">
                      {friend.avatar_url
                        ? <img src={getFileUrl(friend.avatar_url)} alt="" />
                        : <div className="avatar-placeholder">{(friend.display_name?.[0] || friend.username?.[0] || '?').toUpperCase()}</div>
                      }
                      {friend.is_online === 1 && <span className="friend-online-dot"/>}
                    </div>
                    <div className="friend-info">
                      <span className="friend-name">{friend.display_name || friend.username}</span>
                      <span className="friend-username">@{friend.username}</span>
                      {friend.status_text && <span className="friend-status">{friend.status_text}</span>}
                    </div>
                    <div className="friend-actions">
                      <button
                        className="friend-btn friend-btn-msg"
                        onClick={() => startChat(friend)}
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
                        </svg>
                        Message
                      </button>
                      <button
                        className="friend-btn friend-btn-remove"
                        onClick={() => removeFriend(friend.id)}
                        disabled={!!actionLoading[friend.id]}
                        title="Remove friend"
                      >
                        {actionLoading[friend.id] === 'removing' ? <span className="spinner-sm"/> : (
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                            <path d="M14 8c0-2.21-1.79-4-4-4S6 5.79 6 8s1.79 4 4 4 4-1.79 4-4zm3 2v2h6v-2h-6zM2 18v2h16v-2c0-2.66-5.33-4-8-4s-8 1.34-8 4z"/>
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
