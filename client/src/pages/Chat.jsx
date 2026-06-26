import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { get, post } from '../utils/api';
import Sidebar from '../components/Sidebar/Sidebar';
import ChatWindow from '../components/ChatWindow/ChatWindow';
import SettingsPanel from '../components/Settings/SettingsPanel';
import GroupCreate from '../components/Group/GroupCreate';
import NewChatPanel from '../components/Sidebar/NewChatPanel';
import FriendsPanel from '../components/Sidebar/FriendsPanel';
import EventsPanel from '../components/Events/EventsPanel';
import { useSocketContext } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import CallModal from '../components/ChatWindow/CallModal';
import GroupCallModal from '../components/ChatWindow/GroupCallModal';

export default function Chat() {
  const { socket } = useSocketContext();
  const { user: currentUser } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showGroupCreate, setShowGroupCreate] = useState(false);
  const [showNewChatPanel, setShowNewChatPanel] = useState(false);
  const [showFriendsPanel, setShowFriendsPanel] = useState(false);
  const [showEventsPanel, setShowEventsPanel] = useState(false);
  const [activeCallData, setActiveCallData] = useState(null);
  const [activeGroupCall, setActiveGroupCall] = useState(null);
  const [incomingGroupCall, setIncomingGroupCall] = useState(null);

  const location = useLocation();

  // Keep a ref to selected conversation to avoid stale closures in socket handlers
  const selectedConversationRef = useRef(selectedConversation);
  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  // Keep a ref to track activeCallData for the socket event listener closure
  const activeCallDataRef = useRef(activeCallData);
  useEffect(() => {
    activeCallDataRef.current = activeCallData;
  }, [activeCallData]);

  const activeGroupCallRef = useRef(activeGroupCall);
  useEffect(() => {
    activeGroupCallRef.current = activeGroupCall;
  }, [activeGroupCall]);

  useEffect(() => {
    fetchConversations();
  }, []);

  // Handle push notification clicks (selecting the conversation)
  useEffect(() => {
    const handleNotificationClick = (e) => {
      const data = e.detail;
      if (data && data.conversationId) {
        const found = conversations.find(c => c.id === data.conversationId);
        if (found) {
          setSelectedConversation(found);
          setShowFriendsPanel(false);
          setShowNewChatPanel(false);
          setShowSettings(false);
        } else {
          fetchConversations().then(updatedList => {
            const freshFound = updatedList.find(c => c.id === data.conversationId);
            if (freshFound) {
              setSelectedConversation(freshFound);
              setShowFriendsPanel(false);
              setShowNewChatPanel(false);
              setShowSettings(false);
            }
          });
        }
      }
    };

    window.addEventListener('zynk:notification-click', handleNotificationClick);
    return () => window.removeEventListener('zynk:notification-click', handleNotificationClick);
  }, [conversations]);

  // Handle navigation from InvitePage — add the conversation to sidebar if not present
  useEffect(() => {
    if (!location.state?.selectConversation) return;

    const conv = location.state.selectConversation;
    const autoSelect = location.state.autoSelect !== false;

    fetchConversations().then(() => {
      setConversations(prev => {
        if (prev.some(c => c.id === conv.id)) return prev;
        return [conv, ...prev];
      });
      if (autoSelect) setSelectedConversation(conv);
    });

    window.history.replaceState({}, document.title);
  }, [location.state]);

  useEffect(() => {
    if (!socket) return;

    const handleIncomingCall = ({ from, callerName, callerAvatar, signalData, type }) => {
      if (activeCallDataRef.current) {
        socket.emit('reject_call', { targetUserId: from });
        return;
      }
      setActiveCallData({
        incoming: true,
        type,
        signalData,
        otherUser: {
          id: from,
          username: callerName,
          display_name: callerName,
          avatar_url: callerAvatar
        }
      });

      // Show background system/browser notification if the window is in the background
      if (document.visibilityState === 'hidden') {
        if (window.zynk && typeof window.zynk.sendNotification === 'function') {
          window.zynk.sendNotification(
            `📞 Incoming ${type === 'video' ? 'Video' : 'Voice'} Call`,
            `${callerName} is calling you on Zynk`
          );
        } else if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification(`📞 Incoming ${type === 'video' ? 'Video' : 'Voice'} Call`, {
              body: `${callerName} is calling you on Zynk`,
              icon: '/manifest-icon-192.png',
              tag: `call-${from}`,
              requireInteraction: true
            });
          } catch (err) {
            console.error('Browser Call Notification error:', err);
          }
        }
      }
    };

    const handleIncomingGroupCall = ({ groupId, groupName, callType, callerInfo, startedByName }) => {
      if (activeGroupCallRef.current) return;
      const callerName = startedByName || callerInfo?.display_name || callerInfo?.username || 'Someone';
      setIncomingGroupCall({ groupId, groupName, callType, callerInfo, callerName });
      
      if (document.visibilityState === 'hidden') {
        if (window.zynk && typeof window.zynk.sendNotification === 'function') {
          window.zynk.sendNotification(
            `📞 Incoming Group ${callType === 'video' ? 'Video' : 'Voice'} Call`,
            `${callerName} started a call in ${groupName}`
          );
        }
      }
    };

    socket.on('incoming_call', handleIncomingCall);
    socket.on('group_call_incoming', handleIncomingGroupCall);
    return () => {
      socket.off('incoming_call', handleIncomingCall);
      socket.off('group_call_incoming', handleIncomingGroupCall);
    };
  }, [socket]);

  // When a friend request is accepted, add the new conversation to the sidebar
  useEffect(() => {
    if (!socket) return;

    const handleFriendAccepted = ({ conversation, friendId }) => {
      if (!conversation) return;
      setConversations(prev => {
        if (prev.some(c => c.id === conversation.id)) return prev;
        return [{ ...conversation, unreadCount: 0, unread_count: 0 }, ...prev];
      });
    };

    socket.on('friend_request_accepted', handleFriendAccepted);
    return () => socket.off('friend_request_accepted', handleFriendAccepted);
  }, [socket]);

  // Mark active conversation as read and reset unread badge locally
  useEffect(() => {
    if (!selectedConversation || !socket) return;

    socket.emit('message_read', { conversationId: selectedConversation.id });

    setConversations(prev =>
      prev.map(c => {
        if (c.id === selectedConversation.id) {
          return { ...c, unreadCount: 0, unread_count: 0 };
        }
        return c;
      })
    );
  }, [selectedConversation?.id, socket]);

  // Real-time conversation list updates
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (msg) => {
      const currentSelectedId = selectedConversationRef.current?.id;

      setConversations(prev => {
        const index = prev.findIndex(c => c.id === msg.conversation_id);
        const isActive = currentSelectedId === msg.conversation_id;

        if (index !== -1) {
          const updated = [...prev];
          const conv = { ...updated[index] };

          conv.lastMessage = msg;
          conv.last_message = msg;
          conv.last_message_time = msg.created_at;

          if (!isActive && msg.sender_id !== currentUser?.id) {
            const currentCount = conv.unreadCount || conv.unread_count || 0;
            conv.unreadCount = currentCount + 1;
            conv.unread_count = currentCount + 1;
          }

          updated.splice(index, 1);
          return [conv, ...updated];
        } else {
          fetchConversations();
          return prev;
        }
      });

      if (selectedConversationRef.current?.id === msg.conversation_id && msg.sender_id !== currentUser?.id) {
        socket.emit('message_read', { conversationId: msg.conversation_id });
      }
    };

    const handleConversationRead = ({ conversationId }) => {
      setConversations(prev =>
        prev.map(c => {
          if (c.id === conversationId) {
            return { ...c, unreadCount: 0, unread_count: 0 };
          }
          return c;
        })
      );
    };

    socket.on('new_message', handleNewMessage);
    socket.on('conversation_read', handleConversationRead);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('conversation_read', handleConversationRead);
    };
  }, [socket, currentUser?.id]);

  const fetchConversations = async () => {
    try {
      const data = await get('/messages/conversations');
      const convs = data.conversations || [];
      setConversations(convs);
      return convs;
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
      return [];
    }
  };

  const startPrivateChat = async (user) => {
    const existing = conversations.find(c => {
      const otherUser = c.other_user || c.otherUser;
      return c.type === 'private' && otherUser?.id === user.id;
    });
    if (existing) {
      setSelectedConversation(existing);
      setShowFriendsPanel(false);
      setShowNewChatPanel(false);
    } else {
      try {
        const data = await post(`/messages/conversations/private/${user.id}`);
        const newConv = data.conversation;
        setConversations(prev => {
          if (prev.some(c => c.id === newConv.id)) return prev;
          return [newConv, ...prev];
        });
        setSelectedConversation(newConv);
        setShowFriendsPanel(false);
        setShowNewChatPanel(false);
      } catch (err) {
        console.error('Failed to create/get private chat:', err);
      }
    }
  };

  // Called when a conversation object is passed directly (e.g. from FriendsPanel accept)
  const handleOpenConversation = (conversation) => {
    setConversations(prev => {
      if (prev.some(c => c.id === conversation.id)) {
        return prev;
      }
      return [{ ...conversation, unreadCount: 0, unread_count: 0 }, ...prev];
    });
    setSelectedConversation(conversation);
    setShowFriendsPanel(false);
    setShowNewChatPanel(false);
  };

  const handleSelectConversation = (convOrId, targetMessageId = null) => {
    let conv = convOrId;
    if (typeof convOrId === 'string') {
      conv = conversations.find(c => c.id === convOrId);
      if (!conv) {
        // If it's a completely unknown conversation (unlikely if they are a member), we'd need to fetch it.
        // For now, we assume it's in the list.
        return;
      }
    }
    
    // Attach the targetMessageId to the conversation object so ChatWindow can read it
    setSelectedConversation({ ...conv, targetMessageId });
  };

  const handleGroupCreated = (newGroup) => {
    // Normalize to match the conversation list format
    const normalized = {
      ...newGroup,
      members: newGroup.members || [],
      memberCount: (newGroup.members || []).filter(m => m.id !== 'system').length,
      lastMessage: null,
      unreadCount: 0,
    };
    setShowGroupCreate(false);
    setConversations(prev => [normalized, ...prev]);
    setSelectedConversation(normalized);
  };

  return (
    <div className={`chat-layout ${selectedConversation ? 'has-selected-chat' : ''}`}>
      <div className="sidebar-wrapper">
        <Sidebar 
          conversations={conversations} 
          selectedId={selectedConversation?.id} 
          onSelect={handleSelectConversation}
          onOpenSettings={() => setShowSettings(true)}
          onNewGroup={() => setShowGroupCreate(true)}
          onOpenNewChatPanel={() => setShowNewChatPanel(true)}
          onOpenFriendsPanel={() => setShowFriendsPanel(true)}
          onOpenEventsPanel={() => setShowEventsPanel(true)}
          onNewChat={startPrivateChat}
        />

        {/* Overlay panels — rendered inside sidebar wrapper so they slide over the sidebar */}
        {showEventsPanel && (
          <EventsPanel
            onClose={() => setShowEventsPanel(false)}
            onNavigate={(convId) => handleSelectConversation(convId)}
          />
        )}
        {showFriendsPanel && (
          <FriendsPanel
            onClose={() => setShowFriendsPanel(false)}
            onStartChat={handleOpenConversation}
          />
        )}
        {showNewChatPanel && (
          <NewChatPanel
            onClose={() => setShowNewChatPanel(false)}
            onSelectUser={(user) => {
              startPrivateChat(user);
            }}
          />
        )}
        {showGroupCreate && (
          <GroupCreate
            onClose={() => setShowGroupCreate(false)}
            onSuccess={handleGroupCreated}
          />
        )}
        {showSettings && (
          <SettingsPanel onClose={() => setShowSettings(false)} />
        )}
      </div>
      
      <div className="chat-window-container">
        {selectedConversation ? (
          <ChatWindow 
            conversation={selectedConversation} 
            onClose={() => setSelectedConversation(null)} 
            onStartCall={(type) => setActiveCallData({
              otherUser: selectedConversation.other_user || selectedConversation.otherUser,
              type,
              incoming: false
            })}
            onStartGroupCall={(type) => setActiveGroupCall({
              groupId: selectedConversation.id,
              groupName: selectedConversation.name,
              callType: type,
              isInitiator: true
            })}
            onThemeChange={(newTheme) => {
              setConversations(prev => prev.map(c => 
                c.id === selectedConversation.id ? { ...c, theme: newTheme } : c
              ));
            }}
          />
        ) : (
          <div className="flex-center" style={{ width: '100%', height: '100%', flexDirection: 'column', background: 'var(--bg-chat)', backgroundImage: 'var(--chat-pattern)' }}>
            <div style={{ padding: '20px', background: 'var(--bg-active)', borderRadius: '50%', marginBottom: '20px' }}>
              <svg width="60" height="60" viewBox="0 0 24 24" fill="var(--accent-primary)">
                <path d="M12 2C6.48 2 2 6.03 2 11c0 2.84 1.5 5.37 3.82 7.03-.23 1.63-1.04 3.12-1.08 3.2-.08.17-.03.38.11.49.14.12.35.13.51.04 2.15-1.2 3.73-2.02 4.67-2.31C10.63 19.8 11.3 20 12 20c5.52 20 10-4.03 10-9s-4.48-9-10-9z"/>
              </svg>
            </div>
            <h2 style={{ fontWeight: 400, color: 'var(--text-primary)', marginBottom: '10px' }}>Zynk</h2>
            <p style={{ color: 'var(--text-secondary)' }}>Send and receive messages without keeping your phone online.</p>
          </div>
        )}
      </div>

      {activeCallData && (
        <CallModal 
          callData={activeCallData} 
          onCallEnd={() => setActiveCallData(null)} 
        />
      )}

      {activeGroupCall && (
        <GroupCallModal
          groupId={activeGroupCall.groupId}
          groupName={activeGroupCall.groupName}
          callType={activeGroupCall.callType}
          isInitiator={activeGroupCall.isInitiator}
          onEnd={() => setActiveGroupCall(null)}
        />
      )}

      {incomingGroupCall && !activeGroupCall && (
        <div style={{
          position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
          background: 'linear-gradient(135deg, #1a2a1f, #0d1f16)',
          border: '1px solid rgba(0,168,132,0.4)',
          padding: '16px 24px', borderRadius: '16px', zIndex: 9998,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', gap: '20px', color: 'white',
          minWidth: '300px', maxWidth: '420px'
        }}>
          <div style={{ fontSize: '36px' }}>
            {incomingGroupCall.callType === 'video' ? '🎥' : '🎤'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 'bold', fontSize: '15px' }}>
              {incomingGroupCall.callerName} started a {incomingGroupCall.callType === 'video' ? 'video' : 'voice'} call
            </div>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.65)', marginTop: '2px' }}>
              in {incomingGroupCall.groupName}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              onClick={() => setIncomingGroupCall(null)}
              style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'rgba(255,255,255,0.12)', color: 'white', cursor: 'pointer', fontWeight: 500 }}
            >
              Dismiss
            </button>
            <button 
              onClick={() => {
                setIncomingGroupCall(null);
                setActiveGroupCall({ ...incomingGroupCall, isInitiator: false });
              }}
              style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: 'var(--online-color)', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Join
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
