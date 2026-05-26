import React, { useEffect, useRef, useState } from 'react';
import { useMessages } from '../../hooks/useMessages';
import { useSocketContext } from '../../context/SocketContext';
import { getFileUrl } from '../../utils/constants';
import { useAuth } from '../../context/AuthContext';
import MessageInput from './MessageInput';
import MessageBubble from './MessageBubble';
import { formatDateSeparator, formatLastSeen, parseTimestamp } from '../../utils/formatTime';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import './ChatWindow.css';

export default function ChatWindow({ conversation, onClose, onStartCall }) {
  const { messages, loading, hasMore, loadMore, addMessage, removeMessage, updateMessage } = useMessages(conversation.id);
  const { socket, setActiveConversationId } = useSocketContext();
  
  const [deletedForMeIds, setDeletedForMeIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('zynk_deleted_for_me') || '[]');
    } catch {
      return [];
    }
  });

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

    socket.on('new_message', handleNewMessage);
    socket.on('message_deleted', handleMessageDeleted);
    socket.on('message_edited', handleMessageEdited);
    
    socket.emit('join_conversation', { conversationId: conversation.id });

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('message_deleted', handleMessageDeleted);
      socket.off('message_edited', handleMessageEdited);
    };
  }, [socket, conversation.id, addMessage, removeMessage]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages.length]); // Scroll on new messages. Better approach checks if already at bottom.

  return (
    <div className="chat-window">
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
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 500, fontSize: 'var(--fs-md)', color: 'var(--text-primary)' }}>{name}</span>
            <span style={{ fontSize: 'var(--fs-xs)', color: isOnline ? 'var(--online-color)' : 'var(--text-secondary)' }}>
              {isPrivate ? (isSelf ? 'Message yourself' : (isOnline ? 'online' : formatLastSeen(activeUser?.last_seen))) : `${conversation.member_count || 0} members`}
            </span>
          </div>
        </div>
        {isPrivate && !isSelf && onStartCall && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
      </div>
      
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
              <MessageBubble 
                message={msg} 
                isGroup={!isPrivate} 
                isSelf={isSelf} 
                onDeleteForMe={handleDeleteForMe}
              />
            </React.Fragment>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      
      <MessageInput conversationId={conversation.id} />
    </div>
  );
}
