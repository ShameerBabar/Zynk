import { useState, useCallback, useEffect } from 'react';
import { get } from '../utils/api';
import { MESSAGES_PER_PAGE } from '../utils/constants';

export function useMessages(conversationId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  const loadMessages = useCallback(async (reset = false) => {
    if (!conversationId) return;
    if (!reset && (!hasMore || loading)) return;
    
    setLoading(true);
    const currentPage = reset ? 0 : page;
    
    try {
      const data = await get(`/messages/${conversationId}?offset=${currentPage * MESSAGES_PER_PAGE}`);
      
      setHasMore(data.hasMore);
      setMessages(prev => reset ? data.messages : [...prev, ...data.messages]);
      
      if (reset) {
        setPage(1);
      } else {
        setPage(prev => prev + 1);
      }
    } catch (err) {
      console.error('Failed to load messages', err);
    } finally {
      setLoading(false);
    }
  }, [conversationId, page, hasMore, loading]);

  // Initial load when conversation changes
  useEffect(() => {
    setMessages([]);
    setPage(0);
    setHasMore(true);
    if (conversationId) {
      loadMessages(true);
    }
  }, [conversationId]); // We intentionally do not include loadMessages in deps to avoid loops

  const addMessage = useCallback((message) => {
    setMessages(prev => [...prev, message]);
  }, []);

  const removeMessage = useCallback((messageId) => {
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, is_deleted: 1 } : m));
  }, []);

  const updateMessage = useCallback((messageId, newContent) => {
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: newContent } : m));
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
    markMessagesRead,
    markMessagesDelivered
  };
}
