import React, { useState, useEffect } from 'react';
import { get } from '../../utils/api';
import { getFileUrl } from '../../utils/constants';

export default function SearchBar({ onSelectUser }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const data = await get(`/users/search?q=${query}`);
        setResults(data.users || data || []);
      } catch (err) {
        console.error(err);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="search-container">
      <div className="search-input-wrapper">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
        <input 
          type="text" 
          placeholder="Search or start new chat" 
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        {query && (
          <button style={{color: 'var(--text-secondary)'}} onClick={() => setQuery('')}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        )}
      </div>
      
      {results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, 
          background: 'var(--bg-sidebar)', zIndex: 10,
          boxShadow: 'var(--shadow-md)', maxHeight: '300px', overflowY: 'auto'
        }}>
          {results.map(user => (
            <div 
              key={user.id} 
              style={{ padding: '10px 15px', display: 'flex', alignItems: 'center', cursor: 'pointer', borderBottom: '1px solid var(--border-color)' }}
              onClick={() => {
                onSelectUser(user);
                setQuery('');
                setResults([]);
              }}
              className="hover-bg"
            >
              <div className="user-avatar-mini" style={{ marginRight: '10px' }}>
                {user.avatar_url ? <img src={getFileUrl(user.avatar_url)} /> : <div className="avatar-placeholder">{(user.display_name?.[0] || user.username?.[0] || '?').toUpperCase()}</div>}
              </div>
              <div>
                <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{user.display_name}</div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>@{user.username}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
