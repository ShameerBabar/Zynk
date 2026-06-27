import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE } from '../../utils/constants';
import { useAuth } from '../../context/AuthContext';
import ReactMarkdown from 'react-markdown';

export default function ChatSummaryBanner({ conversationId, unreadCount, onDismiss }) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  const handleSummarize = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/ai/summarize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ conversationId, limit: unreadCount })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to summarize');
      
      setSummary(data.summary);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
      style={{
        margin: '16px',
        padding: '16px',
        background: 'linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(168,85,247,0.1) 100%)',
        border: '1px solid rgba(168,85,247,0.2)',
        borderRadius: '16px',
        backdropFilter: 'blur(10px)',
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0,
        zIndex: 10
      }}
    >
      {/* Decorative gradient glow */}
      <div style={{
        position: 'absolute', top: '-50%', left: '-50%', width: '200%', height: '200%',
        background: 'radial-gradient(circle at 50% -20%, rgba(168,85,247,0.15) 0%, transparent 50%)',
        pointerEvents: 'none'
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {!summary && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ fontSize: '24px' }}>🤖</div>
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Zynk Bot
                </h4>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  You have <b>{unreadCount} unread messages</b>. Would you like me to summarize them for you?
                </p>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button
                onClick={onDismiss}
                style={{
                  background: 'transparent', border: 'none', color: 'var(--text-secondary)',
                  padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer'
                }}
              >
                Dismiss
              </button>
              <button
                onClick={handleSummarize}
                style={{
                  background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                  border: 'none', color: '#fff', padding: '8px 20px', borderRadius: '8px',
                  fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(168,85,247,0.25)'
                }}
              >
                Summarize
              </button>
            </div>
          </div>
        )}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 8px' }}>
            <div style={{ fontSize: '24px', animation: 'bounce 1s infinite alternate' }}>🤖</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
                Zynk Bot is reading...
              </div>
              {/* Shimmer line */}
              <div style={{
                height: '4px', width: '100%', background: 'rgba(255,255,255,0.1)',
                borderRadius: '4px', overflow: 'hidden', position: 'relative'
              }}>
                <motion.div
                  initial={{ x: '-100%' }}
                  animate={{ x: '100%' }}
                  transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                  style={{
                    position: 'absolute', top: 0, left: 0, bottom: 0, width: '50%',
                    background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.8), transparent)'
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {summary && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ fontSize: '20px' }}>🤖</div>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Chat Summary
                </h4>
              </div>
              <button
                onClick={onDismiss}
                style={{
                  background: 'transparent', border: 'none', color: 'var(--text-secondary)',
                  cursor: 'pointer', padding: '4px'
                }}
                title="Dismiss"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>
            
            <div style={{ 
              fontSize: '14px', lineHeight: 1.6, color: 'var(--text-primary)',
              background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.05)'
            }}>
              <ReactMarkdown 
                components={{
                  ul: ({node, ...props}) => <ul style={{ margin: '0 0 0 20px', padding: 0 }} {...props} />,
                  li: ({node, ...props}) => <li style={{ marginBottom: '6px' }} {...props} />,
                  p: ({node, ...props}) => <p style={{ margin: '0 0 10px 0' }} {...props} />
                }}
              >
                {summary}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {error && (
          <div style={{ color: '#ef4444', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>⚠️ {error}</span>
            <button onClick={onDismiss} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}>Dismiss</button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
