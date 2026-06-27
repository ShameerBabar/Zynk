import React, { useState, useRef } from 'react';
import './SettingsPanel.css';
import { useAuth } from '../../context/AuthContext';
import { put, uploadAvatar } from '../../utils/api';
import { showToast } from '../Common/Toast';
import { getFileUrl } from '../../utils/constants';

export default function ProfilePanel({ onClose }) {
  const { user, updateProfile, logout } = useAuth();
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [statusText, setStatusText] = useState(user?.status_text || '');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  const handleSave = async () => {
    try {
      setLoading(true);
      const res = await put('/users/profile', {
        display_name: displayName,
        status_text: statusText
      });
      updateProfile(res.user);
      showToast('Profile updated successfully', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      setLoading(true);
      const res = await uploadAvatar(file);
      const updateRes = await put('/users/profile', { avatar_url: res.url });
      updateProfile(updateRes.user);
      showToast('Avatar updated', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="settings-panel slide-in-left">
      <div className="settings-header">
        <button onClick={onClose} style={{ marginRight: '16px', color: 'var(--text-primary)', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"></path></svg>
        </button>
        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '18px', letterSpacing: '0.5px' }}>Profile</span>
      </div>
      
      <div className="settings-content">
        {/* Profile Card */}
        <div className="profile-card">
          <div className="avatar-container" onClick={() => fileInputRef.current?.click()}>
            {user?.avatar_url ? (
              <img src={getFileUrl(user.avatar_url)} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ color: 'var(--text-primary)' }}>{user?.display_name?.[0]?.toUpperCase() || user?.username?.[0]?.toUpperCase()}</span>
            )}
            <div className="avatar-overlay">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M4 4h3l2-2h6l2 2h3c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM12 18c3.31 0 6-2.69 6-6s-2.69-6-6-6-6 2.69-6 6 2.69 6 6 6zm0-10c2.21 0 4 1.79 4 4s-1.79 4-4 4-4-1.79-4-4 1.79-4 4-4z"/></svg>
              EDIT
            </div>
          </div>
          <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={handleAvatarChange} />
          
          <div className="setting-input-group">
            <label className="setting-label">Display Name</label>
            <input 
              type="text" 
              className="setting-input"
              value={displayName}
              placeholder="e.g. Shameer"
              onChange={e => setDisplayName(e.target.value)}
            />
          </div>

          <div className="setting-input-group">
            <label className="setting-label">About Status</label>
            <input 
              type="text" 
              className="setting-input"
              value={statusText}
              placeholder="e.g. Hey there! I am using Zynk."
              onChange={e => setStatusText(e.target.value)}
            />
          </div>

          <button 
            className="premium-button"
            onClick={handleSave} 
            disabled={loading}
            style={{ marginTop: '8px' }}
          >
            {loading ? 'Saving...' : 'Save Profile Changes'}
          </button>
        </div>

        {/* Logout */}
        <div style={{ marginTop: '10px', marginBottom: '40px' }}>
          <button 
            onClick={logout}
            style={{ 
              width: '100%', background: 'transparent', color: 'var(--accent-danger)', 
              border: '1px solid var(--accent-danger)', padding: '14px', borderRadius: '12px', 
              cursor: 'pointer', fontWeight: '600', fontSize: '15px',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = 'var(--accent-danger)';
              e.currentTarget.style.color = 'white';
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--accent-danger)';
            }}
          >
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
}
