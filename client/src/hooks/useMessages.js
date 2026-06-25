import { useState, useCallback, useEffect } from 'react';
import { get } from '../utils/api';
import { MESSAGES_PER_PAGE } from '../utils/constants';

export function useMessages(conversationId, targetMessageId = null) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  const loadMessages = useCallback(async (reset = false) => {
    if (!conversationId) return;
    if (!reset && (!hasMore || loading)) return;
    
    setLoading(true);
    const currentOffset = reset ? 0 : offset;
    
    try {
      let url = `/messages/${conversationId}?offset=${currentOffset}`;
      if (reset && targetMessageId) {
        url = `/messages/${conversationId}?targetMessageId=${targetMessageId}`;
      }
      const data = await get(url);
      
      setHasMore(data.hasMore);
      setMessages(prev => reset ? data.messages : [...prev, ...data.messages]);
      
      // Update offset based on backend response (in case backend calculated a new offset for targetMessageId)
      setOffset(data.offset + data.limit);
    } catch (err) {
      console.error('Failed to load messages', err);
    } finally {
      setLoading(false);
    }
  }, [conversationId, targetMessageId, offset, hasMore, loading]);

  // Initial load when conversation changes
  useEffect(() => {
    setMessages([]);
    setOffset(0);
    setHasMore(true);
    if (conversationId) {
      loadMessages(true);
    }
  }, [conversationId, targetMessageId]); // Load again if targetMessageId changes

  const addMessage = useCallback((message) => {
    setMessages(prev => [...prev, message]);
  }, []);

  const removeMessage = useCallback((messageId) => {
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, is_deleted: 1 } : m));
  }, []);

  const updateMessage = useCallback((messageId, newContent) => {
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: newContent } : m));
  }, []);

  const updatePoll = useCallback((messageId, pollData) => {
    setMessages(prev => prev.map(m => {
      if (m.id === messageId && m.poll) {
        return {
          ...m,
          poll: { ...m.poll, ...pollData }
        };
      }
      return m;
    }));
  }, []);

  const markMessagesRead = useCallback((userId) => {
    setMessages(prev => prev.map(m => m.sender_id !== userId ? { ...m, status: 'read' } : m));
  }, []);

  const markMessagesDelivered = useCallback((messageIds, userId) => {
    const idSet = new Set(messageIds);
    setMessages(prev => prev.map(m => {
      if (idSet.has(m.id) && m.sender_id !== userId && m.status !== 'read') {
        return { ...m, status: 'delivered' };
      }
      return m;
    }));
  }, []);

  return {
    messages,
    loading,
    hasMore,
    loadMore: () => loadMessages(false),
    addMessage,
    removeMessage,
    updateMessage,
    updatePoll,
    markMessagesRead,
    markMessagesDelivered
  };
}
