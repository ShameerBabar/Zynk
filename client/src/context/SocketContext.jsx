import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL } from '../utils/constants';
import { useAuth } from './AuthContext';
import { registerFCM, unregisterFCM } from '../utils/fcm';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const { token, user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [typingUsers, setTypingUsers] = useState(new Map()); // Map<conversationId, Set<userId>>
  const activeConversationIdRef = useRef(null);
  const isAppInBackgroundRef = useRef(false);

  const [activeCallData, setActiveCallData] = useState(null);
  const [activeGroupCall, setActiveGroupCall] = useState(null);
  const [incomingGroupCall, setIncomingGroupCall] = useState(null);
  const [isCallModalOpen, setIsCallModalOpen] = useState(false); // To track if the full-screen modal is open
  const [isGroupCallModalOpen, setIsGroupCallModalOpen] = useState(false);

  const activeCallDataRef = useRef(activeCallData);
  useEffect(() => { activeCallDataRef.current = activeCallData; }, [activeCallData]);
  const activeGroupCallRef = useRef(activeGroupCall);
  useEffect(() => { activeGroupCallRef.current = activeGroupCall; }, [activeGroupCall]);

  const setActiveConversationId = (id) => {
    activeConversationIdRef.current = id;
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SET_ACTIVE_CONVERSATION',
        conversationId: id
      });
    }
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

  // Register FCM push token on mount/login and clean up on unmount/logout.
  // If registration fails on first attempt (e.g. stale subscription), retry once
  // after 4 seconds automatically — users never need to click anything manually.
  useEffect(() => {
    if (!token) return;
    let retryTimer = null;

    const attemptRegister = async (isRetry = false) => {
      const result = await registerFCM(token);
      if (!result && !isRetry) {
        console.log('[FCM] First registration attempt failed, retrying in 4s...');
        retryTimer = setTimeout(() => attemptRegister(true), 4000);
      }
    };

    attemptRegister();

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      unregisterFCM(token);
    };
  }, [token]);

  const triggerNotification = async (senderName, body) => {
    // 1. Electron Notification
    if (window.zynk && typeof window.zynk.sendNotification === 'function') {
      window.zynk.sendNotification(senderName, body);
    } 
    // 2. Capacitor (Android/iOS) Native Local Notification
    else if (Capacitor.isNativePlatform()) {
      try {
        await LocalNotifications.schedule({
          notifications: [
            {
              title: senderName,
              body: body,
              id: new Date().getTime(),
              schedule: { at: new Date(Date.now() + 100) },
              smallIcon: 'ic_stat_name',
            }
          ]
        });
      } catch (err) {
        console.error('Local Notification error:', err);
      }
    }
    // 3. Web Browser Notification
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
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
      timeout: 20000
    });

    setSocket(newSocket);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && newSocket && newSocket.disconnected) {
        console.log('[SOCKET] App visible and disconnected, forcing socket reconnect...');
        newSocket.connect();
      }
    };

    const handleOnlineStatus = () => {
      if (newSocket && newSocket.disconnected) {
        console.log('[SOCKET] Network online, forcing socket reconnect...');
        newSocket.connect();
      }
    };

    let appStateListener = null;
    if (Capacitor.isNativePlatform()) {
      App.addListener('appStateChange', ({ isActive }) => {
        isAppInBackgroundRef.current = !isActive;
        if (isActive && newSocket && newSocket.disconnected) {
          console.log('[SOCKET] App active, forcing socket reconnect...');
          newSocket.connect();
        }
      }).then(listener => {
        appStateListener = listener;
      });
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnlineStatus);

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

    newSocket.on('new_message', (msg) => {
      if (msg.sender_id === user.id) return;

      // Automatically acknowledge delivery
      newSocket.emit('message_delivered', { messageId: msg.id, conversationId: msg.conversation_id });

      const isWindowHidden = document.visibilityState === 'hidden' || isAppInBackgroundRef.current;
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
        } else if (msg.type === 'poll') {
          bodyText = '📊 Poll';
        } else {
          bodyText = '📎 File';
        }
        triggerNotification(senderName, bodyText);
      }
    });

    newSocket.on('notification', (payload) => {
      setTypingUsers(new Map());
      setOnlineUsers(new Set());
    });

    const handleIncomingCall = ({ from, callerName, callerAvatar, signalData, type }) => {
      if (activeCallDataRef.current) {
        newSocket.emit('reject_call', { targetUserId: from });
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
      setIsCallModalOpen(true);

      if (document.visibilityState === 'hidden') {
        triggerNotification(`📞 Incoming ${type === 'video' ? 'Video' : 'Voice'} Call`, `${callerName} is calling you on Zynk`);
      }
    };

    const handleIncomingGroupCall = ({ groupId, groupName, callType, callerInfo, startedByName }) => {
      if (activeGroupCallRef.current) return;
      const callerName = startedByName || callerInfo?.display_name || callerInfo?.username || 'Someone';
      setIncomingGroupCall({ groupId, groupName, callType, callerInfo, callerName });
      
      if (document.visibilityState === 'hidden') {
        triggerNotification(`📞 Incoming Group ${callType === 'video' ? 'Video' : 'Voice'} Call`, `${callerName} started a call in ${groupName}`);
      }
    };

    newSocket.on('incoming_call', handleIncomingCall);
    newSocket.on('group_call_incoming', handleIncomingGroupCall);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnlineStatus);
      if (appStateListener) {
        appStateListener.remove();
      }
      newSocket.off('new_message');
      newSocket.off('incoming_call', handleIncomingCall);
      newSocket.off('group_call_incoming', handleIncomingGroupCall);
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
      activeCallData,
      setActiveCallData,
      activeGroupCall,
      setActiveGroupCall,
      incomingGroupCall,
      setIncomingGroupCall,
      isCallModalOpen,
      setIsCallModalOpen,
      isGroupCallModalOpen,
      setIsGroupCallModalOpen,
      setActiveConversationId,
      sendMessage,
      startTyping,
      stopTyping,
      deleteMessage,
      editMessage,
      markRead
    }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocketContext = () => useContext(SocketContext);
