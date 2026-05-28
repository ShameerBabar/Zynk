import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { get, post } from '../utils/api';
import Sidebar from '../components/Sidebar/Sidebar';
import ChatWindow from '../components/ChatWindow/ChatWindow';
import SettingsPanel from '../components/Settings/SettingsPanel';
import GroupCreate from '../components/Group/GroupCreate';
import NewChatPanel from '../components/Sidebar/NewChatPanel';
import FriendsPanel from '../components/Sidebar/FriendsPanel';
import { useSocketContext } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import CallModal from '../components/ChatWindow/CallModal';

export default function Chat() {
  const { socket } = useSocketContext();
  const { user: currentUser } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showGroupCreate, setShowGroupCreate] = useState(false);
  const [showNewChatPanel, setShowNewChatPanel] = useState(false);
  const [showFriendsPanel, setShowFriendsPanel] = useState(false);
  const [activeCallData, setActiveCallData] = useState(null);

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

  useEffect(() => {
    fetchConversations();
  }, []);

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

    socket.on('incoming_call', handleIncomingCall);
    return () => socket.off('incoming_call', handleIncomingCall);
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

  const handleSelectConversation = (conversation) => {
    setSelectedConversation(conversation);
  };

  const handleGroupCreated = (newGroup) => {
    setShowGroupCreate(false);
    setConversations(prev => [newGroup, ...prev]);
    setSelectedConversation(newGroup);
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
          onNewChat={startPrivateChat}
        />

        {/* Overlay panels — rendered inside sidebar wrapper so they slide over the sidebar */}
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
    </div>
  );
}
