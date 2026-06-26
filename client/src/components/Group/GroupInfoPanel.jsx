import React, { useState, useEffect, useRef } from 'react';
import { get, post, put, del, uploadAvatar } from '../../utils/api';
import { showToast } from '../Common/Toast';
import { getFileUrl } from '../../utils/constants';
import { useAuth } from '../../context/AuthContext';
import { useSocketContext } from '../../context/SocketContext';

export default function GroupInfoPanel({ conversation, onClose, onMembersUpdated, onUpdateConversation, messages = [], onOpenThemeModal }) {
  const { user: currentUser } = useAuth();
  const [members, setMembers] = useState(conversation.members || []);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedToAdd, setSelectedToAdd] = useState([]);
  const [adding, setAdding] = useState(false);
  const [activeTab, setActiveTab] = useState('members'); // 'members' or 'media'
  const [mediaList, setMediaList] = useState(() => messages.filter(m => m.file_url && !m.is_deleted));
  const { socket } = useSocketContext();

  // Edit Mode
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(conversation.name);
  const [avatarUrl, setAvatarUrl] = useState(conversation.avatar_url);
  const fileInputRef = useRef(null);

  // Determine if muted
  const currentMemberInfo = members.find(m => m.id === currentUser?.id);
  const [isMuted, setIsMuted] = useState(conversation.is_muted === 1 || (currentMemberInfo && currentMemberInfo.is_muted === 1) || false);

  useEffect(() => {
    setMembers(conversation.members || []);
  }, [conversation.members]);

  useEffect(() => {
    // Fetch media if tab is media
    if (activeTab === 'media' && mediaList.length === 0) {
      get(`/messages/${conversation.id}/media`).then(res => {
        setMediaList(res.media || []);
      }).catch(err => {
        console.error(err);
      });
    }
  }, [activeTab, conversation.id]);

  useEffect(() => {
    if (!socket) return;
    const handleNewMessage = (msg) => {
      if (msg.conversation_id === conversation.id && msg.file_url) {
        setMediaList(prev => {
          // Prevent duplicates if already added by messages prop update
          if (prev.find(m => m.id === msg.id)) return prev;
          return [msg, ...prev];
        });
      }
    };
    socket.on('new_message', handleNewMessage);
    return () => socket.off('new_message', handleNewMessage);
  }, [socket, conversation.id]);

  useEffect(() => {
    if (messages && messages.length > 0) {
      setMediaList(prev => {
        const existingIds = new Set(prev.map(m => m.id));
        const newMedia = messages.filter(m => m.file_url && !m.is_deleted && !existingIds.has(m.id));
        if (newMedia.length > 0) {
          // Combine and sort by date descending
          const combined = [...prev, ...newMedia].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          return combined;
        }
        return prev;
      });
    }
  }, [messages]);

  const handleSearch = async (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (q.length >= 2) {
      try {
        const res = await get(`/users/search?q=${encodeURIComponent(q)}`);
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

  const handleLeaveGroup = async () => {
    if (!window.confirm('Are you sure you want to leave this group?')) return;
    try {
      await del(`/groups/${conversation.id}/members/${currentUser.id}`);
      showToast('You left the group.', 'success');
      window.location.reload(); // Refresh to remove the conversation from the list
    } catch (err) {
      showToast(err.message || 'Failed to leave group', 'error');
    }
  };

  const handleMuteToggle = async () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    try {
      await put(`/messages/${conversation.id}/mute`, { is_muted: newMuted });
    } catch (err) {
      setIsMuted(!newMuted);
      showToast('Failed to change mute settings', 'error');
    }
  };

  const handleSaveEdit = async () => {
    try {
      const res = await put(`/groups/${conversation.id}`, { name: editName, avatar_url: avatarUrl });
      setIsEditing(false);
      if (onUpdateConversation) {
        onUpdateConversation(res.group);
      }
      showToast('Group updated', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to update group', 'error');
    }
  };

  const handleAvatarClick = () => {
    if (isEditing && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      showToast('Uploading...', 'info');
      const data = await uploadAvatar(file);
      setAvatarUrl(data.url);
      showToast('Upload complete', 'success');
    } catch (err) {
      showToast(err.message || 'Upload failed', 'error');
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
          <div 
            onClick={handleAvatarClick}
            style={{
              width: '60px', height: '60px', borderRadius: '50%',
              background: 'var(--accent-primary)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              color: 'white', fontWeight: 'bold', fontSize: '24px', flexShrink: 0,
              cursor: isEditing ? 'pointer' : 'default', position: 'relative', overflow: 'hidden'
            }}
            title={isEditing ? 'Click to change photo' : ''}
          >
            {avatarUrl
              ? <img src={getFileUrl(avatarUrl)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : (editName || conversation.name)?.[0]?.toUpperCase()}
            
            {isEditing && (
              <div style={{ position: 'absolute', bottom: 0, background: 'rgba(0,0,0,0.5)', width: '100%', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '10px' }}>EDIT</span>
              </div>
            )}
          </div>
          <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleFileChange} />

          <div style={{ flex: 1, minWidth: 0 }}>
            {isEditing ? (
              <input 
                value={editName} onChange={e => setEditName(e.target.value)}
                style={{ width: '100%', padding: '6px', background: 'var(--bg-input)', border: 'none', borderRadius: '4px', color: 'var(--text-primary)' }}
                autoFocus
              />
            ) : (
              <div style={{ fontWeight: 600, fontSize: '18px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {conversation.name}
              </div>
            )}
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {members.length} member{members.length !== 1 ? 's' : ''}
              {onlineCount > 0 && <span style={{ color: 'var(--online-color)' }}> · {onlineCount} online</span>}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '6px', borderRadius: '50%', fontSize: '20px', lineHeight: 1 }} className="hover-bg">
              ×
            </button>
            {isEditing ? (
              <button onClick={handleSaveEdit} style={{ background: 'var(--accent-primary)', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', cursor: 'pointer' }}>Save</button>
            ) : (
              <button onClick={() => setIsEditing(true)} style={{ background: 'transparent', color: 'var(--accent-primary)', border: 'none', fontSize: '13px', cursor: 'pointer', padding: 0 }}>Edit</button>
            )}
          </div>
        </div>

        {/* Action Bar (Mute) */}
        <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>Mute Notifications</span>
          <div onClick={handleMuteToggle} style={{
            width: '40px', height: '22px', borderRadius: '11px', background: isMuted ? 'var(--accent-primary)' : 'var(--border-light)',
            position: 'relative', cursor: 'pointer', transition: 'background 0.2s'
          }}>
            <div style={{
              width: '18px', height: '18px', borderRadius: '50%', background: 'white',
              position: 'absolute', top: '2px', left: isMuted ? '20px' : '2px', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
            }} />
          </div>
        </div>

        {/* Action Bar (Theme) */}
        <div 
          onClick={onOpenThemeModal}
          className="interactive"
          style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
        >
          <span style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>Chat Theme</span>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{conversation.theme && conversation.theme !== 'default' ? conversation.theme.charAt(0).toUpperCase() + conversation.theme.slice(1) : 'Default'} ›</span>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)' }}>
          <button onClick={() => setActiveTab('members')} style={{
            flex: 1, padding: '12px', background: 'transparent', border: 'none', cursor: 'pointer',
            borderBottom: activeTab === 'members' ? '2px solid var(--accent-primary)' : '2px solid transparent',
            color: activeTab === 'members' ? 'var(--accent-primary)' : 'var(--text-secondary)', fontWeight: 600
          }}>Members</button>
          <button onClick={() => setActiveTab('media')} style={{
            flex: 1, padding: '12px', background: 'transparent', border: 'none', cursor: 'pointer',
            borderBottom: activeTab === 'media' ? '2px solid var(--accent-primary)' : '2px solid transparent',
            color: activeTab === 'media' ? 'var(--accent-primary)' : 'var(--text-secondary)', fontWeight: 600
          }}>Media</button>
        </div>

        {activeTab === 'members' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            {/* Add Members Toggle */}
            <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border-color)' }}>
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
                    width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-primary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="white"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
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
                      border: 'none', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', outline: 'none'
                    }}
                  />
                  {selectedToAdd.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {selectedToAdd.map(u => (
                        <span key={u.id} style={{ background: 'var(--accent-primary)', color: 'white', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                          {u.display_name || u.username}
                          <span style={{ cursor: 'pointer', fontWeight: 'bold' }} onClick={() => toggleSelect(u)}>×</span>
                        </span>
                      ))}
                    </div>
                  )}
                  {searchResults.length > 0 && (
                    <div style={{ background: 'var(--bg-app)', borderRadius: 'var(--radius-md)', maxHeight: '120px', overflowY: 'auto' }}>
                      {searchResults.map(u => {
                        const isSelected = selectedToAdd.find(s => s.id === u.id);
                        return (
                          <div key={u.id} onClick={() => toggleSelect(u)} style={{ padding: '8px', cursor: 'pointer', background: isSelected ? 'var(--bg-active)' : 'transparent' }}>
                            <span style={{ fontSize: '13px' }}>{u.display_name || u.username}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button onClick={() => { setShowAddMembers(false); setSearchQuery(''); setSearchResults([]); setSelectedToAdd([]); }} style={{ padding: '6px 12px', background: 'transparent', border: '1px solid var(--border-light)', borderRadius: '4px', color: 'var(--text-primary)', cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleAddMembers} disabled={adding || selectedToAdd.length === 0} style={{ padding: '6px 12px', background: 'var(--accent-primary)', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer' }}>{adding ? 'Adding...' : 'Add'}</button>
                  </div>
                </div>
              )}
            </div>

            {/* Member List */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {members.map(member => (
                <div key={member.id} style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--border-color)' }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
                      {member.avatar_url ? <img src={getFileUrl(member.avatar_url)} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : (member.display_name || member.username)?.[0]?.toUpperCase()}
                    </div>
                    {member.is_online ? <div style={{ position: 'absolute', bottom: '1px', right: '1px', width: '10px', height: '10px', borderRadius: '50%', background: 'var(--online-color)', border: '2px solid var(--bg-modal)' }} /> : null}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '14px' }}>
                      {member.display_name || member.username}
                      {member.id === currentUser?.id && <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginLeft: '6px' }}>(You)</span>}
                    </div>
                    <div style={{ fontSize: '12px', color: member.is_online ? 'var(--online-color)' : 'var(--text-secondary)' }}>{member.is_online ? 'Online' : 'Offline'}</div>
                  </div>
                  {member.role === 'admin' && <span style={{ fontSize: '11px', color: 'var(--accent-primary)', background: 'rgba(var(--accent-rgb),0.15)', padding: '2px 8px', borderRadius: '8px', fontWeight: 600 }}>Admin</span>}
                </div>
              ))}
            </div>
            {/* Leave Button */}
            <div style={{ padding: '15px', borderTop: '1px solid var(--border-color)' }}>
              <button onClick={handleLeaveGroup} style={{ width: '100%', padding: '10px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>Exit Group</button>
            </div>
          </div>
        )}

        {activeTab === 'media' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '5px', alignContent: 'start' }}>
            {mediaList.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '14px' }}>No media in this group yet.</div>
            ) : mediaList.map(m => {
              const handleMediaClick = () => {
                const el = document.getElementById(`message-${m.id}`);
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  el.style.transition = 'background-color 0.5s';
                  el.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                  setTimeout(() => el.style.backgroundColor = 'transparent', 1500);
                }
              };

              if (m.type === 'image') {
                return <div key={m.id} onClick={handleMediaClick} style={{ aspectRatio: '1', overflow: 'hidden', borderRadius: '4px', background: 'var(--bg-active)', cursor: 'pointer' }}><img src={getFileUrl(m.file_url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>;
              } else if (m.type === 'video') {
                return <div key={m.id} onClick={handleMediaClick} style={{ aspectRatio: '1', overflow: 'hidden', borderRadius: '4px', background: '#000', position: 'relative', cursor: 'pointer' }}><video src={getFileUrl(m.file_url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /><div style={{ position: 'absolute', bottom: '4px', left: '4px', color: 'white' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></div></div>;
              } else {
                return <div key={m.id} onClick={handleMediaClick} style={{ aspectRatio: '1', overflow: 'hidden', borderRadius: '4px', background: 'var(--bg-active)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px', textAlign: 'center', cursor: 'pointer' }}><svg width="24" height="24" viewBox="0 0 24 24" fill="var(--text-secondary)"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/></svg><div style={{ fontSize: '10px', marginTop: '4px', wordBreak: 'break-all', color: 'var(--text-secondary)' }}>{m.file_name}</div></div>;
              }
            })}
          </div>
        )}
      </div>
    </div>
  );
}
