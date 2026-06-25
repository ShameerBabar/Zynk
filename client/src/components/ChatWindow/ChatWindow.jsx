import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useMessages } from '../../hooks/useMessages';
import { useSocketContext } from '../../context/SocketContext';
import { getFileUrl } from '../../utils/constants';
import { useAuth } from '../../context/AuthContext';
import MessageInput from './MessageInput';
import MessageBubble from './MessageBubble';
import GroupInfoPanel from '../Group/GroupInfoPanel';
import UserInfoPanel from './UserInfoPanel';
import InChatSearch from './InChatSearch';
import { formatLastSeen, parseTimestamp, formatDateSeparator } from '../../utils/formatTime';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useTheme } from '../../context/ThemeContext';
import './ChatWindow.css';

export default function ChatWindow({ conversation, onClose, onStartCall, onStartGroupCall }) {
  const targetMessageId = conversation.targetMessageId;
  const { messages, loading, hasMore, loadMore, addMessage, removeMessage, updateMessage, updatePoll, markMessagesRead, markMessagesDelivered } = useMessages(conversation.id, targetMessageId);
  const { socket, setActiveConversationId } = useSocketContext();
  const { wallpaper } = useTheme();

  const [deletedForMeIds, setDeletedForMeIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('zynk_deleted_for_me') || '[]');
    } catch {
      return [];
    }
  });
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [showUserInfo, setShowUserInfo] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [inChatTargetId, setInChatTargetId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatchIds, setSearchMatchIds] = useState(new Set());
  // Local members state so adding members updates the panel live
  const [groupMembers, setGroupMembers] = useState(conversation.members || []);

  const handleDeleteForMe = (messageId) => {
    setDeletedForMeIds(prev => {
      const next = [...prev, messageId];
      localStorage.setItem('zynk_deleted_for_me', JSON.stringify(next));
      return next;
    });
  };
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (setActiveConversationId) {
      setActiveConversationId(conversation.id);
    }
    return () => {
      if (setActiveConversationId) {
        setActiveConversationId(null);
      }
    };
  }, [conversation.id, setActiveConversationId]);

  // Keep groupMembers in sync when conversation prop changes
  useEffect(() => {
    setGroupMembers(conversation.members || []);
    // Reset search when switching conversations
    setShowSearch(false);
    setInChatTargetId(null);
  }, [conversation.id]);

  // Real-time: update member list when someone is added
  useEffect(() => {
    if (!socket || conversation.type !== 'group') return;
    const handler = ({ groupId, members }) => {
      if (groupId === conversation.id) {
        setGroupMembers((members || []).filter(m => m.id !== 'system'));
      }
    };
    socket.on('group_member_added', handler);
    return () => socket.off('group_member_added', handler);
  }, [socket, conversation.id, conversation.type]);
  
  const { user: currentUser } = useAuth();
  const isPrivate = conversation.type === 'private';
  const otherUser = conversation.other_user || conversation.otherUser;
  
  const isSelf = isPrivate && (otherUser?.id === currentUser?.id || otherUser?.is_self);
  const activeUser = isSelf ? currentUser : otherUser;
  const name = isPrivate ? (isSelf ? 'You (Message yourself)' : activeUser?.display_name || activeUser?.username) : conversation.name;
  const avatar = getFileUrl(isPrivate ? activeUser?.avatar_url : conversation.avatar_url);
  
  const isOnline = useOnlineStatus(isPrivate && !isSelf ? activeUser?.id : null);

  useEffect(() => {
    if (!socket) return;
    
    const handleNewMessage = (msg) => {
      if (msg.conversation_id === conversation.id) {
        addMessage(msg);
        scrollToBottom();
      }
    };
    
    const handleMessageDeleted = ({ messageId, conversationId }) => {
      if (conversationId === conversation.id) {
        removeMessage(messageId);
      }
    };

    const handleMessageEdited = ({ messageId, conversationId, content }) => {
      if (conversationId === conversation.id) {
        updateMessage(messageId, content);
      }
    };

    const handlePollUpdated = (pollUpdateData) => {
      updatePoll(pollUpdateData.messageId, pollUpdateData);
    };

    const handleConversationRead = ({ conversationId, userId }) => {
      if (conversationId === conversation.id) {
        markMessagesRead(userId);
      }
    };

    const handleMessageDelivered = ({ messageId, conversationId, userId }) => {
      if (conversationId === conversation.id) {
        markMessagesDelivered([messageId], userId);
      }
    };

    const handleMessagesDelivered = ({ conversationId, messageIds, userId }) => {
      if (conversationId === conversation.id) {
        markMessagesDelivered(messageIds, userId);
      }
    };

    socket.on('new_message', handleNewMessage);
    socket.on('message_deleted', handleMessageDeleted);
    socket.on('message_edited', handleMessageEdited);
    socket.on('poll_updated', handlePollUpdated);
    socket.on('conversation_read', handleConversationRead);
    socket.on('message_delivered', handleMessageDelivered);
    socket.on('messages_delivered', handleMessagesDelivered);
    
    socket.emit('join_conversation', { conversationId: conversation.id });

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('message_deleted', handleMessageDeleted);
      socket.off('message_edited', handleMessageEdited);
      socket.off('poll_updated', handlePollUpdated);
      socket.off('conversation_read', handleConversationRead);
      socket.off('message_delivered', handleMessageDelivered);
      socket.off('messages_delivered', handleMessagesDelivered);
    };
  }, [socket, conversation.id, addMessage, removeMessage, updateMessage, updatePoll, markMessagesRead, markMessagesDelivered]);

  const scrollToBottom = (behavior = 'auto') => {
    const scroll = () => messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
    scroll(); // Try immediately
    setTimeout(scroll, 100); // Try after DOM update
    setTimeout(scroll, 300); // Try after some images might have loaded
    setTimeout(scroll, 800); // Fallback for slower images
  };

  // Jump to a specific message from in-chat search (pulse highlight)
  const jumpToMessage = (messageId) => {
    setInChatTargetId(messageId);
    // If message is already in DOM, scroll immediately
    const el = document.getElementById(`message-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.remove('message-highlight-pulse');
      void el.offsetWidth; // force reflow to restart animation
      el.classList.add('message-highlight-pulse');
      setTimeout(() => el.classList.remove('message-highlight-pulse'), 2000);
    }
  };

  useEffect(() => {
    // Handle both global search targetMessageId and in-chat search inChatTargetId
    const activeTarget = inChatTargetId || targetMessageId;
    if (activeTarget && messages.some(m => m.id === activeTarget)) {
      setTimeout(() => {
        const el = document.getElementById(`message-${activeTarget}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('message-highlight-pulse');
          setTimeout(() => el.classList.remove('message-highlight-pulse'), 2000);
        }
      }, 100);
    } else if (!activeTarget) {
      scrollToBottom('auto');
    }
  }, [messages.length, conversation.id, targetMessageId, inChatTargetId]);

  const customBgStyle = (wallpaper === 'custom' && currentUser?.chat_background_url)
    ? { backgroundImage: `url(${getFileUrl(currentUser.chat_background_url)})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : {};

  return (
    <div className="chat-window" style={customBgStyle}>
      <div className="chat-header">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {onClose && (
            <button 
              onClick={onClose} 
              className="chat-back-button hover-bg"
            >
              <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"></path>
              </svg>
            </button>
          )}
          <div className="user-avatar-mini" style={{ width: '40px', height: '40px', marginRight: '15px' }}>
            {avatar ? <img src={avatar} /> : <div className="avatar-placeholder">{name?.[0]?.toUpperCase()}</div>}
          </div>
          <div
            style={{ display: 'flex', flexDirection: 'column', cursor: 'pointer' }}
            onClick={() => isPrivate && !isSelf ? setShowUserInfo(true) : !isPrivate ? setShowGroupInfo(true) : undefined}
            title={isPrivate && !isSelf ? 'Click to view contact info' : !isPrivate ? 'Click to view group info' : undefined}
          >
            <span style={{ fontWeight: 500, fontSize: 'var(--fs-md)', color: 'var(--text-primary)' }}>{name}</span>
            <span style={{ fontSize: 'var(--fs-xs)', color: isOnline ? 'var(--online-color)' : 'var(--text-secondary)' }}>
              {isPrivate ? (isSelf ? 'Message yourself' : (isOnline ? 'online' : formatLastSeen(activeUser?.last_seen))) : (() => {
                const onlineCount = groupMembers.filter(m => m.is_online).length;
                const names = groupMembers.map(m => m.display_name || m.username).join(', ');
                return (
                  <span title={names}>
                    {groupMembers.length} member{groupMembers.length !== 1 ? 's' : ''}
                    {onlineCount > 0 && <span style={{color: 'var(--online-color)'}}> · {onlineCount} online</span>}
                  </span>
                );
              })()}
            </span>
          </div>
        </div>
        {isPrivate && !isSelf && onStartCall && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              onClick={() => setShowSearch(s => !s)}
              style={{ background: 'transparent', border: 'none', color: showSearch ? 'var(--accent-primary)' : 'var(--text-secondary)', cursor: 'pointer', padding: '6px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              className="hover-bg"
              title="Search in chat"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
            </button>
            <button 
              onClick={() => onStartCall('voice')}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '6px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              className="hover-bg"
              title="Voice Call"
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M6.62 10.79a15.149 15.149 0 0 0 6.59 6.59l2.2-2.2c.28-.28.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
              </svg>
            </button>
            <button 
              onClick={() => onStartCall('video')}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '6px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              className="hover-bg"
              title="Video Call"
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
              </svg>
            </button>
          </div>
        )}
        {!isPrivate && onStartGroupCall && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              onClick={() => setShowSearch(s => !s)}
              style={{ background: 'transparent', border: 'none', color: showSearch ? 'var(--accent-primary)' : 'var(--text-secondary)', cursor: 'pointer', padding: '6px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              className="hover-bg"
              title="Search in chat"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
            </button>
            <button
              onClick={() => onStartGroupCall('voice')}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '6px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              className="hover-bg"
              title="Group Voice Call"
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M6.62 10.79a15.149 15.149 0 0 0 6.59 6.59l2.2-2.2c.28-.28.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
              </svg>
            </button>
            <button
              onClick={() => onStartGroupCall('video')}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '6px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              className="hover-bg"
              title="Group Video Call"
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* In-chat search bar */}
      {showSearch && (
        <InChatSearch
          conversationId={conversation.id}
          onJumpTo={jumpToMessage}
          onResults={(q, ids) => {
            setSearchQuery(q);
            setSearchMatchIds(new Set(ids));
          }}
          onClose={() => {
            setShowSearch(false);
            setInChatTargetId(null);
            setSearchQuery('');
            setSearchMatchIds(new Set());
          }}
        />
      )}
      
      <div className="messages-area">
        {loading && <div className="flex-center" style={{ padding: '20px' }}><div className="spinner"></div></div>}
        
        {messages.filter(msg => !deletedForMeIds.includes(msg.id)).map((msg, index, filteredArray) => {
          const prevMsg = filteredArray[index - 1];
          const showDate = !prevMsg || parseTimestamp(msg.created_at).toDateString() !== parseTimestamp(prevMsg.created_at).toDateString();
          
          return (
            <React.Fragment key={msg.id}>
              {showDate && (
                <div className="date-separator">
                  <span>{formatDateSeparator(msg.created_at)}</span>
                </div>
              )}
              <div id={`message-${msg.id}`}>
                <MessageBubble 
                  message={msg} 
                  isGroup={!isPrivate} 
                  isSelf={isSelf} 
                  onDeleteForMe={handleDeleteForMe}
                  searchQuery={searchMatchIds.has(msg.id) ? searchQuery : ''}
                />
              </div>
            </React.Fragment>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      
      <MessageInput conversationId={conversation.id} isBlocked={isBlocked} />

      {showGroupInfo && (
        <GroupInfoPanel
          conversation={{ ...conversation, members: groupMembers }}
          onClose={() => setShowGroupInfo(false)}
          onMembersUpdated={setGroupMembers}
          messages={messages}
        />
      )}

      {showUserInfo && isPrivate && !isSelf && (
        <UserInfoPanel
          conversation={conversation}
          otherUser={activeUser}
          onClose={() => setShowUserInfo(false)}
          onMuteChange={() => {}}
          onBlockChange={(blocked) => setIsBlocked(blocked)}
          messages={messages}
        />
      )}
    </div>
  );
}
