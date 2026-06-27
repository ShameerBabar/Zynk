import React, { useState } from 'react';
import './SettingsPanel.css';
import { useAuth } from '../../context/AuthContext';
import { showToast } from '../Common/Toast';
import { useTheme } from '../../context/ThemeContext';
import { HexColorPicker } from 'react-colorful';

export default function SettingsPanel({ onClose }) {
  const { theme, toggleTheme, wallpaper, setWallpaper, soundEnabled, setSoundEnabled } = useTheme();
  const [pendingWallpaper, setPendingWallpaper] = useState(wallpaper);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const swatches = [
    { id: 'default', color: theme === 'dark' ? '#111b21' : '#efeae2', label: 'Default' },
    { id: 'teal', color: theme === 'dark' ? '#080f14' : '#e6f3f0', label: 'Teal' },
    { id: 'blue', color: theme === 'dark' ? '#08111e' : '#e6eef8', label: 'Blue' },
    { id: 'midnight', color: 'linear-gradient(135deg, #1A2980 0%, #26D0CE 100%)', label: 'Midnight' },
    { id: 'sunset', color: 'linear-gradient(135deg, #FF416C 0%, #FF4B2B 100%)', label: 'Sunset' },
    { id: 'aurora', color: 'linear-gradient(135deg, #00B4DB 0%, #0083B0 100%)', label: 'Aurora' },
    { id: 'lavender', color: 'linear-gradient(135deg, #654ea3 0%, #eaafc8 100%)', label: 'Lavender' },
    { id: 'obsidian', color: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)', label: 'Obsidian' }
  ];

  const appVersion = '1.1.0';

  return (
    <div className="settings-panel slide-in-left">
      <div className="settings-header">
        <button onClick={onClose} style={{ marginRight: '16px', color: 'var(--text-primary)', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"></path></svg>
        </button>
        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '18px', letterSpacing: '0.5px' }}>Settings</span>
      </div>
      
      <div className="settings-content">
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
                <div className="title">App Colour</div>
                <div className="subtitle">Personalize your app background</div>
              </div>
              <div className="wallpaper-swatches">
                {swatches.map(sw => (
                  <div key={sw.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                    <div
                      className={`wallpaper-swatch ${pendingWallpaper === sw.id ? 'active' : ''}`}
                      onClick={() => {
                        setPendingWallpaper(sw.id);
                        setShowColorPicker(false);
                      }}
                      title={sw.label}
                      style={{ background: sw.color }}
                    >
                      {pendingWallpaper === sw.id && (
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#FFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.5))' }}>
                          <path d="M20 6L9 17l-5-5"/>
                        </svg>
                      )}
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>{sw.label}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <div 
                    className={`wallpaper-swatch custom-color ${pendingWallpaper.startsWith('#') || showColorPicker ? 'active' : ''}`}
                    title="Pick Custom Colour"
                    onClick={() => setShowColorPicker(!showColorPicker)}
                    style={{
                      background: pendingWallpaper.startsWith('#') ? pendingWallpaper : 'conic-gradient(from 180deg at 50% 50%, #2a8af6 0deg, #a853ba 180deg, #e92a67 360deg)',
                      position: 'relative',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#FFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}>
                      <path d="M14.5 2.5l7 7-10.5 10.5c-1 1-2.5 1-3.5 0l-3-3c-1-1-1-2.5 0-3.5L14.5 2.5z"/><path d="M2.5 21.5l4-4"/>
                    </svg>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>Custom</span>
                </div>
              </div>
              
              {showColorPicker && (
                <div style={{ width: '100%', marginTop: '12px', display: 'flex', justifyContent: 'center' }}>
                  <HexColorPicker 
                    color={pendingWallpaper.startsWith('#') ? pendingWallpaper : '#14B8A6'} 
                    onChange={setPendingWallpaper} 
                    style={{ width: '100%', height: '160px' }}
                  />
                </div>
              )}

              {pendingWallpaper !== wallpaper && (
                <button 
                  className="premium-button"
                  style={{ marginTop: '4px', width: '100%', padding: '10px', fontSize: '13px' }}
                  onClick={() => {
                    setWallpaper(pendingWallpaper);
                    showToast('App colour applied globally!', 'success');
                  }}
                >
                  Apply Colour
                </button>
              )}
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

        {/* App Info */}
        <div className="settings-section">
          <div className="settings-section-title">App Info</div>
          <div className="settings-card">
            <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '4px' }}>
              <div className="diagnostic-row">
                <span>App Version</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{appVersion}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
