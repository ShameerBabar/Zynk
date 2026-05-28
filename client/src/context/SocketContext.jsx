import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL } from '../utils/constants';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const { token, user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [typingUsers, setTypingUsers] = useState(new Map()); // Map<conversationId, Set<userId>>
  const activeConversationIdRef = useRef(null);

  const setActiveConversationId = (id) => {
    activeConversationIdRef.current = id;
  };

  // Request Notification permission on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
          console.log('Notification permission status:', permission);
        });
      }
    }
  }, []);

  const triggerNotification = (senderName, body) => {
    // 1. Electron Notification
    if (window.zynk && typeof window.zynk.sendNotification === 'function') {
      window.zynk.sendNotification(senderName, body);
    } 
    // 2. Web Browser Notification
    else if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(senderName, {
          body,
          icon: '/manifest-icon-192.png'
        });
      } catch (err) {
        console.error('Browser Notification error:', err);
      }
    }
  };

  useEffect(() => {
    if (!token || !user) return;

    const newSocket = io(SOCKET_URL, {
      auth: { token }
    });

    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Socket connected:', newSocket.id);
    });

    newSocket.on('user_online', ({ userId }) => {
      setOnlineUsers(prev => {
        const newSet = new Set(prev);
        newSet.add(userId);
        return newSet;
      });
    });

    newSocket.on('online_users', ({ userIds }) => {
      setOnlineUsers(new Set(userIds));
    });

    newSocket.on('user_offline', ({ userId }) => {
      setOnlineUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
    });

    newSocket.on('user_typing', ({ conversationId, userId }) => {
      setTypingUsers(prev => {
        const newMap = new Map(prev);
        const users = newMap.get(conversationId) || new Set();
        users.add(userId);
        newMap.set(conversationId, users);
        return newMap;
      });
    });

    newSocket.on('user_stop_typing', ({ conversationId, userId }) => {
      setTypingUsers(prev => {
        const newMap = new Map(prev);
        const users = newMap.get(conversationId);
        if (users) {
          users.delete(userId);
          if (users.size === 0) {
            newMap.delete(conversationId);
          } else {
            newMap.set(conversationId, users);
          }
        }
        return newMap;
      });
    });

    // Global listener for new messages to trigger notifications
    newSocket.on('new_message', (msg) => {
      if (msg.sender_id === user.id) return;

      const isWindowHidden = document.visibilityState === 'hidden';
      const isDifferentConversation = msg.conversation_id !== activeConversationIdRef.current;

      if (isWindowHidden || isDifferentConversation) {
        const senderName = msg.sender?.display_name || msg.sender?.username || 'New Message';
        let bodyText = '';
        if (msg.type === 'text') {
          bodyText = msg.content;
        } else if (msg.type === 'image') {
          bodyText = '📷 Photo';
        } else if (msg.type === 'audio') {
          bodyText = '🎵 Voice message';
        } else {
          bodyText = '📎 File';
        }
        triggerNotification(senderName, bodyText);
      }
    });

    return () => {
      newSocket.off('new_message');
      newSocket.disconnect();
    };
  }, [token, user]);

  const sendMessage = (data) => {
    if (socket) socket.emit('send_message', data);
  };

  const startTyping = (conversationId) => {
    if (socket) socket.emit('typing_start', { conversationId });
  };

  const stopTyping = (conversationId) => {
    if (socket) socket.emit('typing_stop', { conversationId });
  };

  const deleteMessage = (messageId, conversationId) => {
    if (socket) socket.emit('delete_message', { messageId, conversationId });
  };

  const editMessage = (messageId, conversationId, newContent) => {
    if (socket) socket.emit('edit_message', { messageId, conversationId, newContent });
  };

  const markRead = (messageId, conversationId) => {
    if (socket) socket.emit('message_read', { messageId, conversationId });
  };

  return (
    <SocketContext.Provider value={{
      socket,
      onlineUsers,
      typingUsers,
      sendMessage,
      startTyping,
      stopTyping,
      deleteMessage,
      editMessage,
      markRead,
      setActiveConversationId
    }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocketContext = () => useContext(SocketContext);
