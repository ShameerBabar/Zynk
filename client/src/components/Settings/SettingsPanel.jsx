import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { put, uploadAvatar } from '../../utils/api';
import { showToast } from '../Common/Toast';
import { getFileUrl } from '../../utils/constants';
import { useTheme } from '../../context/ThemeContext';
import { useSocketContext } from '../../context/SocketContext';

export default function SettingsPanel({ onClose }) {
  const { user, updateProfile, logout } = useAuth();
  const { theme, toggleTheme, wallpaper, setWallpaper, soundEnabled, setSoundEnabled } = useTheme();
  const { socket } = useSocketContext();
  
  const isSocketConnected = socket?.connected;
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [statusText, setStatusText] = useState(user?.status_text || '');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  const [deferredPrompt, setDeferredPrompt] = useState(window.deferredPrompt);

  useEffect(() => {
    const handleInstallable = () => {
      setDeferredPrompt(window.deferredPrompt);
    };
    window.addEventListener('pwa-installable', handleInstallable);
    return () => window.removeEventListener('pwa-installable', handleInstallable);
  }, []);

  const handleInstallApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    window.deferredPrompt = null;
    setDeferredPrompt(null);
  };

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

  const swatches = [
    { id: 'default', color: theme === 'dark' ? '#111b21' : '#efeae2', label: 'Default' },
    { id: 'teal', color: theme === 'dark' ? '#080f14' : '#e6f3f0', label: 'Teal' },
    { id: 'blue', color: theme === 'dark' ? '#08111e' : '#e6eef8', label: 'Blue' },
    { id: 'green', color: theme === 'dark' ? '#08140e' : '#e6f3e9', label: 'Green' },
    { id: 'charcoal', color: theme === 'dark' ? '#121212' : '#f0f0f0', label: 'Charcoal' }
  ];

  const appVersion = '1.0.0';
  const platformName = window.zynk?.platform || 'Web/Browser';

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, width: 'var(--sidebar-width)', height: '100%',
      background: 'var(--bg-sidebar)', zIndex: 100, display: 'flex', flexDirection: 'column'
    }} className="slide-in-left">
      <div style={{ height: 'var(--header-height)', display: 'flex', alignItems: 'center', padding: '0 16px', background: 'var(--bg-active)', borderBottom: '1px solid var(--border-color)' }}>
        <button onClick={onClose} style={{ marginRight: '16px', color: 'var(--text-primary)', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"></path></svg>
        </button>
        <span style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '18px' }}>Settings</span>
      </div>
      
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '24px', overflowY: 'auto', flex: 1 }}>
        {/* Profile Card */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', paddingBottom: '15px', borderBottom: '1px solid var(--border-color)' }}>
          <div 
            style={{ width: '100px', height: '100px', borderRadius: '50%', overflow: 'hidden', background: 'var(--bg-active)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', position: 'relative' }}
            onClick={() => fileInputRef.current?.click()}
          >
            {user?.avatar_url ? (
              <img src={getFileUrl(user.avatar_url)} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ color: 'var(--text-primary)' }}>{user?.display_name?.[0]?.toUpperCase() || user?.username?.[0]?.toUpperCase()}</span>
            )}
            <div style={{ position: 'absolute', bottom: 0, width: '100%', background: 'rgba(0,0,0,0.5)', color: 'white', textAlign: 'center', padding: '3px 0', fontSize: '10px' }}>
              CHANGE
            </div>
          </div>
          <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={handleAvatarChange} />
          
          <div style={{ width: '100%' }}>
            <label style={{ color: 'var(--accent-primary)', fontSize: '13px', marginBottom: '6px', display: 'block', fontWeight: 500 }}>Your Display Name</label>
            <input 
              type="text" 
              value={displayName}
              placeholder="e.g. Shameer"
              onChange={e => setDisplayName(e.target.value)}
              style={{ width: '100%', background: 'var(--bg-app)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '15px', padding: '8px 10px', outline: 'none' }}
            />
          </div>

          <div style={{ width: '100%' }}>
            <label style={{ color: 'var(--accent-primary)', fontSize: '13px', marginBottom: '6px', display: 'block', fontWeight: 500 }}>About Status</label>
            <input 
              type="text" 
              value={statusText}
              placeholder="e.g. Hey there! I am using Zynk."
              onChange={e => setStatusText(e.target.value)}
              style={{ width: '100%', background: 'var(--bg-app)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '15px', padding: '8px 10px', outline: 'none' }}
            />
          </div>

          <button 
            onClick={handleSave} 
            disabled={loading}
            style={{ width: '100%', background: 'var(--accent-primary)', color: 'white', border: 'none', padding: '10px', borderRadius: '6px', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1, fontWeight: '600', fontSize: '14px' }}
          >
            {loading ? 'Saving...' : 'Save Profile Details'}
          </button>
        </div>

        {/* PWA Install Button */}
        {deferredPrompt && (
          <div style={{ paddingBottom: '15px', borderBottom: '1px solid var(--border-color)' }}>
            <h4 style={{ color: 'var(--text-primary)', fontSize: '15px', marginBottom: '12px', fontWeight: 600 }}>Install App</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '4px', lineHeight: 1.4 }}>Install Zynk on your device home screen for a fast, native app experience.</div>
              <button 
                onClick={handleInstallApp} 
                style={{ width: '100%', background: 'var(--accent-primary)', color: 'white', border: 'none', padding: '10px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '14px', transition: 'background var(--transition-fast)' }}
                onMouseOver={e => e.currentTarget.style.background = 'var(--accent-primary-hover)'}
                onMouseOut={e => e.currentTarget.style.background = 'var(--accent-primary)'}
              >
                Install Zynk App
              </button>
            </div>
          </div>
        )}

        {/* Appearance Settings */}
        <div style={{ paddingBottom: '15px', borderBottom: '1px solid var(--border-color)' }}>
          <h4 style={{ color: 'var(--text-primary)', fontSize: '15px', marginBottom: '15px', fontWeight: 600 }}>Appearance</h4>
          
          {/* Theme Toggle */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <div style={{ color: 'var(--text-primary)', fontSize: '14px' }}>Theme Mode</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Choose between dark or light mode</div>
            </div>
            <button 
              onClick={toggleTheme}
              style={{ 
                background: 'var(--bg-active)', border: '1px solid var(--border-color)', 
                borderRadius: '8px', padding: '8px 12px', color: 'var(--text-primary)', 
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                fontSize: '13px'
              }}
            >
              {theme === 'dark' ? (
                <>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41l-1.06-1.06zm-1.06-10.9a.996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41l-1.06-1.06a.996.996 0 0 0-1.41 0zm-10.9 10.9a.996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41l-1.06-1.06a.996.996 0 0 0-1.41 0z"/></svg>
                  Light Mode
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12.3 22h-.1c-5.5 0-10-4.5-10-10C2.2 6.8 6.5 2.5 11.7 2.1c.5 0 .8.4.7.9-.1.4-.4.8-.9.9-3.8.7-6.5 4.1-6.5 8.1 0 4.6 3.8 8.4 8.4 8.4 4 0 7.4-2.7 8.1-6.5.1-.5.5-.8.9-.9.5-.1.9.2.9.7-.4 5.2-4.7 9.3-9.9 9.3z"/></svg>
                  Dark Mode
                </>
              )}
            </button>
          </div>

          {/* Wallpaper Swatches */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ color: 'var(--text-primary)', fontSize: '14px' }}>Chat Wallpaper</div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              {swatches.map(sw => (
                <button
                  key={sw.id}
                  onClick={() => setWallpaper(sw.id)}
                  title={sw.label}
                  style={{
                    width: '32px', height: '32px', borderRadius: '50%',
                    background: sw.color, cursor: 'pointer',
                    border: wallpaper === sw.id ? '2px solid var(--accent-primary)' : '2px solid transparent',
                    boxShadow: '0 0 3px rgba(0,0,0,0.5)',
                    padding: 0
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Notifications Settings */}
        <div style={{ paddingBottom: '15px', borderBottom: '1px solid var(--border-color)' }}>
          <h4 style={{ color: 'var(--text-primary)', fontSize: '15px', marginBottom: '15px', fontWeight: 600 }}>Notifications</h4>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ color: 'var(--text-primary)', fontSize: '14px' }}>Message Sounds</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Play sounds for incoming messages</div>
            </div>
            <input 
              type="checkbox" 
              checked={soundEnabled} 
              onChange={e => setSoundEnabled(e.target.checked)}
              style={{
                width: '40px', height: '20px',
                accentColor: 'var(--accent-primary)',
                cursor: 'pointer'
              }}
            />
          </div>
        </div>

        {/* Diagnostic App Info */}
        <div style={{ paddingBottom: '10px' }}>
          <h4 style={{ color: 'var(--text-primary)', fontSize: '15px', marginBottom: '12px', fontWeight: 600 }}>App Information</h4>
          <div style={{ 
            background: 'var(--bg-app)', border: '1px solid var(--border-color)', 
            borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', 
            gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' 
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Version:</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{appVersion}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>OS Platform:</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: '500', textTransform: 'capitalize' }}>{platformName}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Server Status:</span>
              <span style={{ 
                color: isSocketConnected ? 'var(--online-color)' : 'var(--accent-danger)', 
                fontWeight: '600', display: 'flex', alignItems: 'center', gap: '5px' 
              }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: isSocketConnected ? 'var(--online-color)' : 'var(--accent-danger)', display: 'inline-block' }}></span>
                {isSocketConnected ? 'Connected' : 'Offline'}
              </span>
            </div>
          </div>
        </div>

        {/* Logout Button */}
        <button 
          onClick={logout}
          style={{ 
            width: '100%', background: 'transparent', color: 'var(--accent-danger)', 
            border: '1px solid var(--accent-danger)', padding: '10px', borderRadius: '6px', 
            cursor: 'pointer', fontWeight: '600', fontSize: '14px', marginTop: 'auto',
            transition: 'background var(--transition-fast)'
          }}
          onMouseOver={e => e.currentTarget.style.background = 'rgba(234, 67, 53, 0.1)'}
          onMouseOut={e => e.currentTarget.style.background = 'transparent'}
        >
          Log Out
        </button>
      </div>
    </div>
  );
}
