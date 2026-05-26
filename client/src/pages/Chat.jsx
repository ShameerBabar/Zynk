import React, { useState, useEffect } from 'react';
import { get, post } from '../utils/api';
import Sidebar from '../components/Sidebar/Sidebar';
import ChatWindow from '../components/ChatWindow/ChatWindow';
import SettingsPanel from '../components/Settings/SettingsPanel';
import GroupCreate from '../components/Group/GroupCreate';
import NewChatPanel from '../components/Sidebar/NewChatPanel';
import InvitePanel from '../components/Sidebar/InvitePanel';
import { useSocketContext } from '../context/SocketContext';
import CallModal from '../components/ChatWindow/CallModal';

export default function Chat() {
  const { socket } = useSocketContext();
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showGroupCreate, setShowGroupCreate] = useState(false);
  const [showNewChatPanel, setShowNewChatPanel] = useState(false);
  const [showInvitePanel, setShowInvitePanel] = useState(false);
  const [activeCallData, setActiveCallData] = useState(null);

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handleIncomingCall = ({ from, callerName, callerAvatar, signalData, type }) => {
      // Auto-reject if already in a call
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
    };

    socket.on('incoming_call', handleIncomingCall);

    return () => {
      socket.off('incoming_call', handleIncomingCall);
    };
  }, [socket]);

  // Keep a ref to track activeCallData for the socket event listener closure
  const activeCallDataRef = React.useRef(activeCallData);
  useEffect(() => {
    activeCallDataRef.current = activeCallData;
  }, [activeCallData]);

  const fetchConversations = async () => {
    try {
      const data = await get('/messages/conversations');
      setConversations(data.conversations || []);
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    }
  };

  const startPrivateChat = async (user) => {
    const existing = conversations.find(c => {
      const otherUser = c.other_user || c.otherUser;
      return c.type === 'private' && otherUser?.id === user.id;
    });
    if (existing) {
      setSelectedConversation(existing);
    } else {
      try {
        const data = await post(`/messages/conversations/private/${user.id}`);
        const newConv = data.conversation;
        setConversations(prev => {
          if (prev.some(c => c.id === newConv.id)) return prev;
          return [newConv, ...prev];
        });
        setSelectedConversation(newConv);
      } catch (err) {
        console.error('Failed to create/get private chat:', err);
      }
    }
  };

  const handleSelectConversation = (conversation) => {
    setSelectedConversation(conversation);
  };

  const handleNewGroup = () => {
    setShowGroupCreate(true);
  };

  const handleGroupCreated = (newGroup) => {
    setShowGroupCreate(false);
    setConversations(prev => [newGroup, ...prev]);
    setSelectedConversation(newGroup);
  };

  return (
    <div className={`chat-layout ${selectedConversation ? 'has-selected-chat' : ''}`}>
      <Sidebar 
        conversations={conversations} 
        selectedId={selectedConversation?.id} 
        onSelect={handleSelectConversation}
        onOpenSettings={() => setShowSettings(true)}
        onNewGroup={handleNewGroup}
        onOpenNewChatPanel={() => setShowNewChatPanel(true)}
        onOpenInvitePanel={() => setShowInvitePanel(true)}
        onNewChat={startPrivateChat}
      />
      
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

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {showGroupCreate && <GroupCreate onClose={() => setShowGroupCreate(false)} onSuccess={handleGroupCreated} />}
      {showNewChatPanel && <NewChatPanel onClose={() => setShowNewChatPanel(false)} onSelectUser={(user) => {
        startPrivateChat(user);
        setShowNewChatPanel(false);
      }} />}
      {showInvitePanel && <InvitePanel onClose={() => setShowInvitePanel(false)} />}
      
      {activeCallData && (
        <CallModal 
          callData={activeCallData} 
          onCallEnd={() => setActiveCallData(null)} 
        />
      )}
    </div>
  );
}
