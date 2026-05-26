import React, { useState } from 'react';
import { get, post } from '../../utils/api';
import { showToast } from '../Common/Toast';

export default function GroupCreate({ onClose, onSuccess }) {
  const [name, setName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (q.length >= 2) {
      try {
        const res = await get(`/users/search?q=${encodeURIComponent(q)}`);
        setSearchResults(res.users || []);
      } catch (err) {
        console.error(err);
      }
    } else {
      setSearchResults([]);
    }
  };

  const toggleMember = (user) => {
    if (selectedMembers.find(m => m.id === user.id)) {
      setSelectedMembers(selectedMembers.filter(m => m.id !== user.id));
    } else {
      setSelectedMembers([...selectedMembers, user]);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) return showToast('Group name is required', 'error');
    if (selectedMembers.length === 0) return showToast('Select at least one member', 'error');

    try {
      setLoading(true);
      const res = await post('/groups', {
        name: name.trim(),
        memberIds: selectedMembers.map(m => m.id)
      });
      showToast('Group created successfully', 'success');
      onSuccess(res.group || res);
    } catch (err) {
      showToast(err.message || 'Failed to create group', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(11, 20, 26, 0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{ background: 'var(--bg-modal)', padding: '20px', borderRadius: 'var(--radius-lg)', width: '400px', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', gap: '15px', maxHeight: '90vh' }}>
        <h2 style={{ margin: 0, fontWeight: 500 }}>Create New Group</h2>
        
        <div>
          <label style={{ fontSize: '14px', color: 'var(--accent-primary)', marginBottom: '5px', display: 'block' }}>Group Name</label>
          <input 
            value={name} onChange={e => setName(e.target.value)}
            style={{ width: '100%', padding: '10px', background: 'var(--bg-input)', border: 'none', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', outline: 'none', fontSize: '15px' }}
            placeholder="Enter group name"
          />
        </div>

        <div>
          <label style={{ fontSize: '14px', color: 'var(--accent-primary)', marginBottom: '5px', display: 'block' }}>Add Members</label>
          <input 
            value={searchQuery} onChange={handleSearch}
            style={{ width: '100%', padding: '10px', background: 'var(--bg-input)', border: 'none', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', outline: 'none', fontSize: '15px' }}
            placeholder="Search users by name or phone..."
          />
        </div>

        {selectedMembers.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {selectedMembers.map(user => (
              <div key={user.id} style={{ background: 'var(--bg-active)', padding: '5px 10px', borderRadius: '15px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {user.display_name || user.username}
                <span style={{ cursor: 'pointer', fontWeight: 'bold', color: 'var(--text-secondary)' }} onClick={() => toggleMember(user)}>×</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ overflowY: 'auto', flex: 1, minHeight: '150px', maxHeight: '250px', background: 'var(--bg-app)', borderRadius: 'var(--radius-md)' }}>
          {searchResults.length === 0 && searchQuery.length >= 2 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>No users found</div>
          ) : searchResults.map(user => {
            const isSelected = selectedMembers.find(m => m.id === user.id);
            return (
              <div key={user.id} onClick={() => toggleMember(user)} style={{ padding: '10px 15px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', background: isSelected ? 'var(--bg-active)' : 'transparent' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '14px' }}>
                  {user.avatar_url ? <img src={user.avatar_url} style={{width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover'}} /> : (user.display_name?.[0] || user.username?.[0])?.toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: '15px' }}>{user.display_name || user.username}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{user.phone}</div>
                </div>
                {isSelected && <div style={{ color: 'var(--accent-primary)', fontWeight: 'bold' }}>✓</div>}
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
          <button onClick={onClose} style={{ padding: '10px 20px', background: 'transparent', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 500 }}>Cancel</button>
          <button onClick={handleCreate} disabled={loading} style={{ padding: '10px 20px', background: 'var(--accent-primary)', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', cursor: loading ? 'default' : 'pointer', fontWeight: 500, opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Creating...' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>
  );
}
