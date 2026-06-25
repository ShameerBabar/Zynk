import React, { useState, useEffect } from 'react';
import { get } from '../../utils/api';
import { getFileUrl } from '../../utils/constants';
import './GlobalSearch.css';

const FILTERS = [
  { id: 'all', label: 'All', icon: null },
  { id: 'image', label: 'Images', icon: '📷' },
  { id: 'video', label: 'Videos', icon: '🎥' },
  { id: 'audio', label: 'Voice Notes', icon: '🎤' },
  { id: 'document', label: 'Documents', icon: '📄' },
  { id: 'link', label: 'Links', icon: '🔗' },
];

export default function GlobalSearch({ onClose, onSelectUser, onSelectMessage }) {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [results, setResults] = useState({ users: [], messages: [] });
  const [isSearching, setIsSearching] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);

  useEffect(() => {
    const saved = localStorage.getItem('zynk_recent_searches');
    if (saved) {
      try { setRecentSearches(JSON.parse(saved)); } catch (e) {}
    }
  }, []);

  const saveRecentSearch = (text) => {
    if (!text.trim()) return;
    const updated = [text.trim(), ...recentSearches.filter(s => s.toLowerCase() !== text.trim().toLowerCase())].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('zynk_recent_searches', JSON.stringify(updated));
  };

  useEffect(() => {
    if (!query.trim() && activeFilter === 'all') {
      setResults({ users: [], messages: [] });
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const data = await get(`/search?q=${encodeURIComponent(query.trim())}&filter=${activeFilter}`);
        setResults(data);
      } catch (err) {
        console.error(err);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query, activeFilter]);

  const highlightText = (text, highlight) => {
    if (!highlight || !text) return text;
    const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
    return parts.map((part, index) => 
      part.toLowerCase() === highlight.toLowerCase() ? <span key={index} className="highlight">{part}</span> : part
    );
  };

  const handleResultClick = (msg) => {
    saveRecentSearch(query);
    onSelectMessage(msg.conversation.id, msg.id);
  };

  const handleUserClick = (user) => {
    saveRecentSearch(query);
    onSelectUser(user);
  };

  const renderMessageContent = (msg) => {
    if (msg.type === 'text' || msg.type === 'link') {
      return <span>{highlightText(msg.content, query)}</span>;
    }
    if (msg.type === 'image') return <span>📷 Photo {highlightText(msg.file_name, query)}</span>;
    if (msg.type === 'video') return <span>🎥 Video {highlightText(msg.file_name, query)}</span>;
    if (msg.type === 'audio') return <span>🎤 Voice Note</span>;
    if (msg.type === 'document' || msg.type === 'file') return <span>📄 Document {highlightText(msg.file_name, query)}</span>;
    return <span>{msg.content}</span>;
  };

  return (
    <div className="global-search-overlay">
      <div className="global-search-header">
        <button className="back-btn" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
        </button>
        <div className="global-search-input-wrapper">
          <input 
            autoFocus
            type="text" 
            placeholder="Search all conversations..." 
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') saveRecentSearch(query);
            }}
          />
          {query && (
            <button style={{color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer'}} onClick={() => setQuery('')}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          )}
        </div>
      </div>

      <div className="global-search-filters">
        {FILTERS.map(f => (
          <div 
            key={f.id} 
            className={`filter-chip ${activeFilter === f.id ? 'active' : ''}`}
            onClick={() => setActiveFilter(f.id)}
          >
            {f.icon && <span>{f.icon}</span>}
            {f.label}
          </div>
        ))}
      </div>

      <div className="global-search-content">
        {!query && activeFilter === 'all' && recentSearches.length > 0 && (
          <div>
            <div className="search-section-title">Recent Searches</div>
            {recentSearches.map((s, i) => (
              <div key={i} className="recent-search-item" onClick={() => setQuery(s)}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                <span>{s}</span>
              </div>
            ))}
          </div>
        )}

        {(query || activeFilter !== 'all') && !isSearching && results.users.length === 0 && results.messages.length === 0 && (
          <div className="no-results">No results found for your search.</div>
        )}

        {results.users && results.users.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <div className="search-section-title">Users</div>
            {results.users.map(user => (
              <div key={user.id} className="search-result-user" onClick={() => handleUserClick(user)}>
                <div className="user-avatar-mini">
                  {user.avatar_url ? <img src={getFileUrl(user.avatar_url)} /> : <div className="avatar-placeholder">{(user.display_name?.[0] || user.username?.[0] || '?').toUpperCase()}</div>}
                </div>
                <div>
                  <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{highlightText(user.display_name, query)}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>@{highlightText(user.username, query)}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {results.messages && results.messages.length > 0 && (
          <div>
            <div className="search-section-title">Messages</div>
            {results.messages.map(msg => (
              <div key={msg.id} className="search-result-message" onClick={() => handleResultClick(msg)}>
                <div className="search-msg-header">
                  <div className="conv-name">
                    <div className="user-avatar-mini" style={{ width: '20px', height: '20px' }}>
                      {msg.conversation.avatar_url ? (
                        <img src={getFileUrl(msg.conversation.avatar_url)} />
                      ) : (
                        <div className="avatar-placeholder" style={{ fontSize: '10px' }}>{msg.conversation.name[0]?.toUpperCase()}</div>
                      )}
                    </div>
                    {msg.conversation.name}
                  </div>
                  <span>{new Date(msg.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                </div>
                <div className="search-msg-body">
                  <div style={{ flex: 1 }}>
                    <div className="search-msg-sender">{msg.sender.display_name}</div>
                    <div className="search-msg-content">{renderMessageContent(msg)}</div>
                  </div>
                  {msg.type === 'image' && msg.file_url && (
                    <div className="search-msg-media">
                      <img src={getFileUrl(msg.file_url)} alt="preview" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
