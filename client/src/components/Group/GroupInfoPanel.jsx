import React, { useState, useEffect } from 'react';
import { get, post } from '../../utils/api';
import { showToast } from '../Common/Toast';
import { getFileUrl } from '../../utils/constants';
import { useAuth } from '../../context/AuthContext';

export default function GroupInfoPanel({ conversation, onClose, onMembersUpdated }) {
  const { user: currentUser } = useAuth();
  const [members, setMembers] = useState(conversation.members || []);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedToAdd, setSelectedToAdd] = useState([]);
  const [adding, setAdding] = useState(false);

  // Refresh members when conversation changes
  useEffect(() => {
    setMembers(conversation.members || []);
  }, [conversation.members]);

  const handleSearch = async (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (q.length >= 2) {
      try {
        const res = await get(`/users/search?q=${encodeURIComponent(q)}`);
        // Filter out users already in the group
        const memberIds = new Set(members.map(m => m.id));
        setSearchResults((res.users || []).filter(u => !memberIds.has(u.id)));
      } catch (err) {
        console.error(err);
      }
    } else {
      setSearchResults([]);
    }
  };

  const toggleSelect = (user) => {
    if (selectedToAdd.find(u => u.id === user.id)) {
      setSelectedToAdd(selectedToAdd.filter(u => u.id !== user.id));
    } else {
      setSelectedToAdd([...selectedToAdd, user]);
    }
  };

  const handleAddMembers = async () => {
    if (selectedToAdd.length === 0) return;
    setAdding(true);
    try {
      const res = await post(`/groups/${conversation.id}/members`, {
        memberIds: selectedToAdd.map(u => u.id),
      });
      const newMembers = (res.members || []).filter(m => m.id !== 'system');
      setMembers(newMembers);
      setSelectedToAdd([]);
      setSearchQuery('');
      setSearchResults([]);
      setShowAddMembers(false);
      showToast(`Added ${selectedToAdd.length} member${selectedToAdd.length > 1 ? 's' : ''}`, 'success');
      if (onMembersUpdated) onMembersUpdated(newMembers);
    } catch (err) {
      showToast(err.message || 'Failed to add members', 'error');
    } finally {
      setAdding(false);
    }
  };

  const onlineCount = members.filter(m => m.is_online).length;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.6)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--bg-modal)', borderRadius: 'var(--radius-lg)',
        width: '90%', maxWidth: '420px', maxHeight: '85vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)'
      }}>
        {/* Header */}
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{
            width: '52px', height: '52px', borderRadius: '50%',
            background: 'var(--accent-primary)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: 'white', fontWeight: 'bold', fontSize: '22px', flexShrink: 0
          }}>
            {conversation.avatar_url
              ? <img src={getFileUrl(conversation.avatar_url)} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
              : conversation.name?.[0]?.toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: '17px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {conversation.name}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {members.length} member{members.length !== 1 ? 's' : ''}
              {onlineCount > 0 && <span style={{ color: 'var(--online-color)' }}> · {onlineCount} online</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '6px', borderRadius: '50%', fontSize: '20px', lineHeight: 1 }} className="hover-bg">
            ×
          </button>
        </div>

        {/* Add Members Toggle */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-color)' }}>
          {!showAddMembers ? (
            <button
              onClick={() => setShowAddMembers(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                background: 'transparent', border: 'none', color: 'var(--accent-primary)',
                cursor: 'pointer', fontWeight: 500, fontSize: '14px', padding: '6px 0', width: '100%'
              }}
            >
              <span style={{
                width: '36px', height: '36px', borderRadius: '50%', background: 'var(--accent-primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="white">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                </svg>
              </span>
              Add Members
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input
                autoFocus
                value={searchQuery}
                onChange={handleSearch}
                placeholder="Search users to add..."
                style={{
                  width: '100%', padding: '10px 14px', background: 'var(--bg-input)',
                  border: 'none', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
                  outline: 'none', fontSize: '14px', boxSizing: 'border-box'
                }}
              />
              {/* Selected chips */}
              {selectedToAdd.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {selectedToAdd.map(u => (
                    <span key={u.id} style={{
                      background: 'var(--accent-primary)', color: 'white',
                      padding: '4px 10px', borderRadius: '12px', fontSize: '13px',
                      display: 'flex', alignItems: 'center', gap: '5px'
                    }}>
                      {u.display_name || u.username}
                      <span style={{ cursor: 'pointer', fontWeight: 'bold', opacity: 0.8 }} onClick={() => toggleSelect(u)}>×</span>
                    </span>
                  ))}
                </div>
              )}
              {/* Search results */}
              {searchResults.length > 0 && (
                <div style={{ background: 'var(--bg-app)', borderRadius: 'var(--radius-md)', maxHeight: '160px', overflowY: 'auto' }}>
                  {searchResults.map(u => {
                    const isSelected = selectedToAdd.find(s => s.id === u.id);
                    return (
                      <div key={u.id} onClick={() => toggleSelect(u)} style={{
                        padding: '9px 12px', display: 'flex', alignItems: 'center', gap: '10px',
                        cursor: 'pointer', background: isSelected ? 'var(--bg-active)' : 'transparent',
                        borderBottom: '1px solid var(--border-color)'
                      }} className="hover-bg">
                        <div style={{
                          width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                          background: 'var(--accent-primary)', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '13px'
                        }}>
                          {u.avatar_url ? <img src={getFileUrl(u.avatar_url)} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : (u.display_name || u.username)?.[0]?.toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{u.display_name || u.username}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{u.username}</div>
                        </div>
                        {isSelected && <svg viewBox="0 0 24 24" width="18" height="18" fill="var(--accent-primary)"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>}
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => { setShowAddMembers(false); setSearchQuery(''); setSearchResults([]); setSelectedToAdd([]); }}
                  style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '13px' }}>
                  Cancel
                </button>
                <button onClick={handleAddMembers} disabled={adding || selectedToAdd.length === 0}
                  style={{ padding: '8px 16px', background: 'var(--accent-primary)', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', cursor: selectedToAdd.length === 0 ? 'default' : 'pointer', fontWeight: 500, fontSize: '13px', opacity: selectedToAdd.length === 0 ? 0.5 : 1 }}>
                  {adding ? 'Adding...' : `Add ${selectedToAdd.length > 0 ? selectedToAdd.length : ''}`}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Member List */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <div style={{ padding: '10px 20px 4px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Members ({members.length})
          </div>
          {members.map(member => (
            <div key={member.id} style={{
              padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '12px',
              borderBottom: '1px solid var(--border-color)'
            }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{
                  width: '40px', height: '40px', borderRadius: '50%',
                  background: 'var(--accent-primary)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '15px'
                }}>
                  {member.avatar_url
                    ? <img src={getFileUrl(member.avatar_url)} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                    : (member.display_name || member.username)?.[0]?.toUpperCase()}
                </div>
                {member.is_online ? (
                  <div style={{
                    position: 'absolute', bottom: '1px', right: '1px',
                    width: '10px', height: '10px', borderRadius: '50%',
                    background: 'var(--online-color)', border: '2px solid var(--bg-modal)'
                  }} />
                ) : null}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '14px' }}>
                  {member.display_name || member.username}
                  {member.id === currentUser?.id && <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginLeft: '6px' }}>(You)</span>}
                </div>
                <div style={{ fontSize: '12px', color: member.is_online ? 'var(--online-color)' : 'var(--text-secondary)' }}>
                  {member.is_online ? 'Online' : 'Offline'}
                </div>
              </div>
              {member.role === 'admin' && (
                <span style={{ fontSize: '11px', color: 'var(--accent-primary)', background: 'rgba(var(--accent-rgb),0.15)', padding: '2px 8px', borderRadius: '8px', fontWeight: 600 }}>
                  Admin
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
