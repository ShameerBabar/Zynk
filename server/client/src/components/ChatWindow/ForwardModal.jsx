import React, { useState } from 'react';
import { getFileUrl } from '../../utils/constants';

export default function ForwardModal({ message, conversations, onClose, onForwardSubmit }) {
  const [selectedConversationId, setSelectedConversationId] = useState(null);

  if (!message) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100000,
      background: 'rgba(0,0,0,0.6)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      padding: '20px'
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-modal)',
        width: '100%', maxWidth: '400px',
        borderRadius: '16px', display: 'flex', flexDirection: 'column',
        maxHeight: '80vh', overflow: 'hidden',
        boxShadow: 'var(--shadow-lg)'
      }} onClick={e => e.stopPropagation()}>
        
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border-light)' }}>
          <h2 style={{ fontSize: '18px', margin: 0, color: 'var(--text-primary)' }}>Forward Message</h2>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '10px' }}>
          {conversations.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No conversations available.
            </div>
          ) : (
            conversations.map(conv => {
              const name = conv.type === 'private' ? (conv.other_user?.display_name || conv.other_user?.username || 'User') : conv.name;
              const avatar = getFileUrl(conv.type === 'private' ? conv.other_user?.avatar_url : conv.avatar_url);
              
              return (
                <div 
                  key={conv.id}
                  onClick={() => setSelectedConversationId(conv.id)}
                  style={{
                    display: 'flex', alignItems: 'center', padding: '12px',
                    borderRadius: '8px', cursor: 'pointer',
                    background: selectedConversationId === conv.id ? 'var(--bg-active)' : 'transparent',
                    marginBottom: '4px'
                  }}
                  className="hover-bg"
                >
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', overflow: 'hidden', marginRight: '12px', background: 'var(--border-light)' }}>
                    {avatar ? (
                      <img src={avatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                        {name?.[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1, fontWeight: 500, color: 'var(--text-primary)' }}>
                    {name}
                  </div>
                  {selectedConversationId === conv.id && (
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="var(--accent-primary)">
                      <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
                    </svg>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button 
            onClick={onClose}
            style={{ padding: '8px 16px', border: '1px solid var(--border-light)', background: 'transparent', color: 'var(--text-secondary)', borderRadius: '8px', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button 
            disabled={!selectedConversationId}
            onClick={() => {
              onForwardSubmit(selectedConversationId, message);
              onClose();
            }}
            style={{ padding: '8px 16px', border: 'none', background: 'var(--accent-primary)', color: 'white', borderRadius: '8px', cursor: selectedConversationId ? 'pointer' : 'not-allowed', opacity: selectedConversationId ? 1 : 0.5, fontWeight: 500 }}
          >
            Forward
          </button>
        </div>
      </div>
    </div>
  );
}
