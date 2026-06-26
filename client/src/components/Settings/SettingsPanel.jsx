import React, { useState, useRef, useEffect } from 'react';
import './SettingsPanel.css';
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

  const handleForceUpdate = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        for (let reg of registrations) {
          reg.unregister();
        }
      });
    }
    if ('caches' in window) {
      caches.keys().then(names => {
        for (let name of names) {
          caches.delete(name);
        }
      });
    }
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  // Push notification diagnostics states
  const [notificationPermission, setNotificationPermission] = useState(() => {
    try {
      return typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
    } catch {
      return 'unsupported';
    }
  });
  const [fcmSupported, setFcmSupported] = useState(false);
  const [fcmToken, setFcmToken] = useState(localStorage.getItem('zynk_fcm_token') || 'None');
  const [swState, setSwState] = useState('Checking...');
  const [isCopied, setIsCopied] = useState(false);
  const [reloadingToken, setReloadingToken] = useState(false);

  useEffect(() => {
    // Check FCM support
    import('../../utils/fcm').then(m => {
      setFcmSupported(m.isPushSupported());
    });

    // Check service worker state
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (!reg) setSwState('Not registered');
        else if (reg.active) setSwState('Active');
        else if (reg.waiting) setSwState('Waiting');
        else if (reg.installing) setSwState('Installing');
        else setSwState('Registered (Unknown)');
      }).catch(err => setSwState('Error: ' + err.message));
    } else {
      setSwState('Unsupported');
    }
  }, []);

  const handleCopyToken = () => {
    if (fcmToken && fcmToken !== 'None') {
      navigator.clipboard.writeText(fcmToken);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      showToast('FCM Token copied to clipboard', 'success');
    }
  };

  const handleReRegisterToken = async () => {
    try {
      setReloadingToken(true);
      const m = await import('../../utils/fcm');
      const token = localStorage.getItem('zynk_token');
      if (token) {
        const freshToken = await m.registerFCM(token);
        if (freshToken) {
          setFcmToken(freshToken);
          setNotificationPermission(Notification.permission);
          showToast('FCM Token re-registered successfully!', 'success');
        } else {
          showToast('FCM Registration returned null. Check permissions.', 'warning');
        }
      } else {
        showToast('You are not logged in.', 'error');
      }
    } catch (err) {
      showToast('Re-registration failed: ' + err.message, 'error');
    } finally {
      setReloadingToken(false);
    }
  };

  // Re-sync form fields whenever user data arrives/changes from the server
  // (handles the case where user was null during initial render after a refresh)
  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || '');
      setStatusText(user.status_text || '');
    }
  }, [user?.id, user?.display_name, user?.status_text]);

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

  const isIOS = typeof navigator !== 'undefined' && 
    (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) &&
    !window.MSStream;
  const isStandalone = typeof window !== 'undefined' && (window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches);
  const showIOSInstructions = isIOS && !isStandalone;

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

  const appVersion = '1.1.0';
  const platformName = window.zynk?.platform || 'Web/Browser';

  return (
    <div className="settings-panel slide-in-left">
      <div className="settings-header">
        <button onClick={onClose} style={{ marginRight: '16px', color: 'var(--text-primary)', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"></path></svg>
        </button>
        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '18px', letterSpacing: '0.5px' }}>Settings</span>
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

        {/* PWA Install Button / iOS Instructions */}
        {(deferredPrompt || showIOSInstructions) && (
          <div className="settings-section">
            <div className="settings-section-title">Install App</div>
            <div className="settings-card" style={{ padding: '20px' }}>
              {showIOSInstructions ? (
                <>
                  <div style={{ color: 'var(--text-primary)', fontSize: '14px', marginBottom: '12px', fontWeight: 600 }}>How to install on iPhone:</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <span style={{ color: 'var(--accent-primary)', fontWeight: 'bold' }}>1.</span>
                      <span>Tap the <b>Share</b> button in Safari's bottom menu bar.</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <span style={{ color: 'var(--accent-primary)', fontWeight: 'bold' }}>2.</span>
                      <span>Scroll down and tap <b>Add to Home Screen</b>.</span>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.5 }}>Install Zynk on your device home screen for a fast, native app experience.</div>
                  <button className="premium-button" onClick={handleInstallApp}>
                    Install Zynk App
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Appearance Settings */}
        <div className="settings-section">
          <div className="settings-section-title">Appearance</div>
          <div className="settings-card">
            <div className="settings-row interactive" onClick={toggleTheme}>
              <div className="settings-row-text">
                <div className="title">Theme Mode</div>
                <div className="subtitle">Switch between dark & light</div>
              </div>
              <div style={{ color: 'var(--text-secondary)' }}>
                {theme === 'dark' ? (
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41l-1.06-1.06zm-1.06-10.9a.996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41l-1.06-1.06a.996.996 0 0 0-1.41 0zm-10.9 10.9a.996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41l-1.06-1.06a.996.996 0 0 0-1.41 0z"/></svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12.3 22h-.1c-5.5 0-10-4.5-10-10C2.2 6.8 6.5 2.5 11.7 2.1c.5 0 .8.4.7.9-.1.4-.4.8-.9.9-3.8.7-6.5 4.1-6.5 8.1 0 4.6 3.8 8.4 8.4 8.4 4 0 7.4-2.7 8.1-6.5.1-.5.5-.8.9-.9.5-.1.9.2.9.7-.4 5.2-4.7 9.3-9.9 9.3z"/></svg>
                )}
              </div>
            </div>
            <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '12px' }}>
              <div className="settings-row-text">
                <div className="title">Chat Wallpaper</div>
                <div className="subtitle">Personalize your chat background</div>
              </div>
              <div className="wallpaper-swatches">
                {swatches.map(sw => (
                  <div
                    key={sw.id}
                    className={`wallpaper-swatch ${wallpaper === sw.id ? 'active' : ''}`}
                    onClick={() => setWallpaper(sw.id)}
                    title={sw.label}
                    style={{ background: sw.color }}
                  />
                ))}
                <div 
                  title="Custom Image"
                  className={`wallpaper-swatch custom ${wallpaper === 'custom' ? 'active' : ''}`}
                  onClick={() => document.getElementById('wallpaper-upload').click()}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="var(--text-secondary)"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-5.04-6.71l-2.75 3.54-1.96-2.36L6.5 17h11l-3.54-4.71z"/></svg>
                </div>
                <input type="file" id="wallpaper-upload" style={{ display: 'none' }} accept="image/*" onChange={async (e) => {
                  const file = e.target.files[0];
                  if (!file) return;
                  try {
                    const res = await uploadAvatar(file);
                    const updateRes = await put('/users/profile', { chat_background_url: res.url });
                    updateProfile(updateRes.user);
                    setWallpaper('custom');
                    showToast('Wallpaper updated', 'success');
                  } catch (err) {
                    showToast(err.message, 'error');
                  }
                }} />
              </div>
            </div>
          </div>
        </div>

        {/* Notifications Settings */}
        <div className="settings-section">
          <div className="settings-section-title">Notifications</div>
          <div className="settings-card">
            <div className="settings-row">
              <div className="settings-row-text">
                <div className="title">Message Sounds</div>
                <div className="subtitle">Play a sound for incoming messages</div>
              </div>
              <label className="premium-toggle">
                <input type="checkbox" checked={soundEnabled} onChange={e => setSoundEnabled(e.target.checked)} />
                <span className="toggle-slider"></span>
              </label>
            </div>
          </div>
        </div>

        {/* Diagnostics & Advanced */}
        <div className="settings-section">
          <div className="settings-section-title">Diagnostics & Advanced</div>
          <div className="settings-card">
            <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '4px' }}>
              <div className="diagnostic-row">
                <span>App Version</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{appVersion}</span>
              </div>
              <div className="diagnostic-row">
                <span>Platform</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: '600', textTransform: 'capitalize' }}>{platformName}</span>
              </div>
              <div className="diagnostic-row">
                <span>Server Status</span>
                <span style={{ color: isSocketConnected ? 'var(--online-color)' : 'var(--accent-danger)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'currentColor' }}></span>
                  {isSocketConnected ? 'Connected' : 'Offline'}
                </span>
              </div>
              <div className="diagnostic-row">
                <span>Push Engine</span>
                <span style={{ color: fcmSupported ? 'var(--online-color)' : 'var(--accent-danger)', fontWeight: '600' }}>
                  {fcmSupported ? 'FCM Ready' : 'Unsupported'}
                </span>
              </div>
              <div className="diagnostic-row">
                <span>Push Permission</span>
                <span style={{ color: notificationPermission === 'granted' ? 'var(--online-color)' : notificationPermission === 'denied' ? 'var(--accent-danger)' : 'var(--text-primary)', fontWeight: '600' }}>
                  {String(notificationPermission || 'unsupported').toUpperCase()}
                </span>
              </div>
            </div>
            
            {fcmToken !== 'None' && (
              <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-primary)', fontSize: '13.5px', fontWeight: '600' }}>FCM Token</span>
                  <button onClick={handleCopyToken} style={{ background: 'var(--bg-active)', border: 'none', color: 'var(--accent-primary)', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>
                    {isCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: '11.5px', wordBreak: 'break-all', background: 'rgba(0,0,0,0.1)', padding: '8px 10px', borderRadius: '6px', maxHeight: '60px', overflowY: 'auto', color: 'var(--text-secondary)', width: '100%' }}>
                  {fcmToken}
                </div>
              </div>
            )}
            
            <div className="settings-row" style={{ flexDirection: 'column', gap: '10px' }}>
              <button className="premium-button premium-button-secondary" onClick={handleReRegisterToken} disabled={reloadingToken}>
                {reloadingToken ? 'Re-registering...' : 'Force Re-Register Push'}
              </button>
              <button className="premium-button premium-button-secondary" onClick={handleForceUpdate}>
                Force Reload App Cache
              </button>
            </div>
          </div>
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
