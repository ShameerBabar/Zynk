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
  const [notificationPermission, setNotificationPermission] = useState(
    typeof window !== 'undefined' ? Notification.permission : 'unknown'
  );
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
    <div className="sidebar-panel slide-in-left">
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
              <div 
                title="Custom Image"
                onClick={() => { document.getElementById('wallpaper-upload').click(); }}
                style={{
                    width: '32px', height: '32px', borderRadius: '50%',
                    background: 'var(--bg-active)', cursor: 'pointer',
                    border: wallpaper === 'custom' ? '2px solid var(--accent-primary)' : '2px dashed var(--text-secondary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="var(--text-secondary)"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-5.04-6.71l-2.75 3.54-1.96-2.36L6.5 17h11l-3.54-4.71z"/></svg>
              </div>
              <input type="file" id="wallpaper-upload" style={{ display: 'none' }} accept="image/*" onChange={async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                try {
                  const res = await uploadAvatar(file); // upload file
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

        {/* Push Notification Diagnostics */}
        <div style={{ paddingBottom: '10px' }}>
          <h4 style={{ color: 'var(--text-primary)', fontSize: '15px', marginBottom: '12px', fontWeight: 600 }}>Push Notification Diagnostics</h4>
          <div style={{ 
            background: 'var(--bg-app)', border: '1px solid var(--border-color)', 
            borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', 
            gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' 
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Permission State:</span>
              <span style={{ 
                color: notificationPermission === 'granted' ? 'var(--online-color)' : notificationPermission === 'denied' ? 'var(--accent-danger)' : 'var(--text-primary)',
                fontWeight: '600'
              }}>
                {notificationPermission.toUpperCase()}
              </span>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>FCM Push Engine:</span>
              <span style={{ 
                color: fcmSupported ? 'var(--online-color)' : 'var(--accent-danger)',
                fontWeight: '600'
              }}>
                {fcmSupported ? 'Supported (FCM)' : 'Unsupported'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Service Worker:</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>
                {swState}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Push Token State:</span>
              <span style={{ 
                color: fcmToken !== 'None' ? 'var(--online-color)' : 'var(--accent-danger)',
                fontWeight: '600'
              }}>
                {fcmToken !== 'None' ? 'Active' : 'Missing'}
              </span>
            </div>

            {fcmToken !== 'None' && (
              <div style={{ marginTop: '4px', borderTop: '1px dashed var(--border-color)', paddingTop: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span>FCM Token:</span>
                  <button 
                    onClick={handleCopyToken}
                    style={{
                      background: 'var(--bg-active)', border: 'none', color: 'var(--accent-primary)',
                      padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px',
                      fontWeight: '600'
                    }}
                  >
                    {isCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <div style={{
                  fontFamily: 'monospace', fontSize: '11px', wordBreak: 'break-all',
                  background: 'rgba(0,0,0,0.2)', padding: '6px', borderRadius: '4px',
                  maxHeight: '60px', overflowY: 'auto', color: 'var(--text-primary)'
                }}>
                  {fcmToken}
                </div>
              </div>
            )}

            <button
              onClick={handleReRegisterToken}
              disabled={reloadingToken}
              style={{
                marginTop: '8px', width: '100%', background: 'var(--bg-active)',
                border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                padding: '8px', borderRadius: '6px', cursor: reloadingToken ? 'default' : 'pointer',
                fontWeight: '600', fontSize: '12px', transition: 'background var(--transition-fast)'
              }}
              onMouseOver={e => !reloadingToken && (e.currentTarget.style.background = 'var(--border-light)')}
              onMouseOut={e => !reloadingToken && (e.currentTarget.style.background = 'var(--bg-active)')}
            >
              {reloadingToken ? 'Re-registering...' : 'Force Re-Register Push'}
            </button>
          </div>
          </div>

          <div className="settings-section">
            <h3 className="section-title" style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '12px', letterSpacing: '0.5px' }}>App Updates</h3>
            <div className="settings-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                If you are using the homescreen app and it hasn't updated to the latest version, you can force a reload here.
              </span>
              <button 
                onClick={handleForceUpdate}
                style={{
                  width: '100%', background: 'var(--bg-active)',
                  border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                  padding: '8px', borderRadius: '6px', cursor: 'pointer',
                  fontWeight: '600', fontSize: '12px', transition: 'background var(--transition-fast)'
                }}
                onMouseOver={e => (e.currentTarget.style.background = 'var(--border-light)')}
                onMouseOut={e => (e.currentTarget.style.background = 'var(--bg-active)')}
              >
                Force Reload App
              </button>
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
