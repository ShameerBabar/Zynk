import React, { useState, useEffect, useRef, useCallback } from 'react';
import { get } from '../../utils/api';

/**
 * InChatSearch — search within a single conversation.
 *
 * Props:
 *  conversationId  — current conversation
 *  onJumpTo(id)    — called when the user navigates to a result; parent should
 *                    update targetMessageId so ChatWindow loads the right page
 *  onClose()       — dismiss the search bar
 */
export default function InChatSearch({ conversationId, onJumpTo, onClose }) {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState([]);   // [{id, content, sender_name}…] newest→oldest
  const [cursor, setCursor]     = useState(-1);   // index into results; -1 = no selection
  const [loading, setLoading]   = useState(false);
  const inputRef                = useRef(null);
  const debounceRef             = useRef(null);

  // Auto-focus on mount
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Debounced search — fires 300ms after the user stops typing
  const doSearch = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); setCursor(-1); return; }
    setLoading(true);
    try {
      const data = await get(`/messages/${conversationId}/search?q=${encodeURIComponent(q.trim())}`);
      setResults(data.results || []);
      setCursor(data.results?.length ? 0 : -1);
      // Jump to first result immediately
      if (data.results?.length) onJumpTo(data.results[0].id);
    } catch {
      setResults([]);
      setCursor(-1);
    } finally {
      setLoading(false);
    }
  }, [conversationId, onJumpTo]);

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
  };

  // Navigate older (up arrow = higher index = older message)
  const goOlder = () => {
    if (!results.length) return;
    const next = cursor + 1 < results.length ? cursor + 1 : cursor;
    setCursor(next);
    onJumpTo(results[next].id);
  };

  // Navigate newer (down arrow = lower index = newer message)
  const goNewer = () => {
    if (!results.length) return;
    const next = cursor - 1 >= 0 ? cursor - 1 : 0;
    setCursor(next);
    onJumpTo(results[next].id);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter')  { e.shiftKey ? goOlder() : goNewer(); }
    if (e.key === 'Escape') { onClose(); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); goOlder(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); goNewer(); }
  };

  const handleClose = () => {
    clearTimeout(debounceRef.current);
    onClose();
  };

  const hasResults  = results.length > 0;
  const noResults   = !loading && query.trim().length > 0 && results.length === 0;
  const currentNum  = hasResults ? cursor + 1 : 0;
  const totalNum    = results.length;

  // Highlight the matched keyword inside a snippet
  const highlight = (text, q) => {
    if (!q || !text) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    const before = text.slice(0, idx);
    const match  = text.slice(idx, idx + q.length);
    const after  = text.slice(idx + q.length);
    return (
      <>
        {before}
        <mark style={{ background: 'rgba(255,214,0,0.5)', color: 'inherit', borderRadius: '2px', padding: '0 1px' }}>
          {match}
        </mark>
        {after}
      </>
    );
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 12px',
      background: 'var(--bg-sidebar)',
      borderBottom: '1px solid var(--border-color)',
      animation: 'slideDown 0.18s ease',
    }}>
      {/* Search icon */}
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"
        style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
        <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
      </svg>

      {/* Input */}
      <input
        ref={inputRef}
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Search in chat…"
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: 'var(--text-primary)',
          fontSize: '14px',
        }}
      />

      {/* Counter */}
      {query.trim().length > 0 && (
        <span style={{
          fontSize: '12px',
          color: noResults ? '#ef4444' : 'var(--text-secondary)',
          whiteSpace: 'nowrap',
          minWidth: '54px',
          textAlign: 'center',
          flexShrink: 0,
        }}>
          {loading ? '…' : noResults ? 'No results' : `${currentNum} / ${totalNum}`}
        </span>
      )}

      {/* Up arrow (older) */}
      <button
        onClick={goOlder}
        disabled={!hasResults || cursor >= results.length - 1}
        title="Older match (↑)"
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--text-secondary)', padding: '4px', borderRadius: '4px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: (!hasResults || cursor >= results.length - 1) ? 0.3 : 1,
          transition: 'opacity 0.15s',
        }}
        className="hover-bg"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/>
        </svg>
      </button>

      {/* Down arrow (newer) */}
      <button
        onClick={goNewer}
        disabled={!hasResults || cursor <= 0}
        title="Newer match (↓)"
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--text-secondary)', padding: '4px', borderRadius: '4px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: (!hasResults || cursor <= 0) ? 0.3 : 1,
          transition: 'opacity 0.15s',
        }}
        className="hover-bg"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
        </svg>
      </button>

      {/* Close */}
      <button
        onClick={handleClose}
        title="Close search (Esc)"
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--text-secondary)', padding: '4px', borderRadius: '4px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '20px', lineHeight: 1,
        }}
        className="hover-bg"
      >×</button>

      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
