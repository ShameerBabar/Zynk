import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import ThemeRenderer from './ThemeRenderer';

const THEMES = [
  { id: 'default', name: 'Default (None)', icon: '✨' },
  { id: 'rain', name: 'Rain', icon: '🌧️' },
  { id: 'snow', name: 'Snow', icon: '❄️' },
  { id: 'space', name: 'Space', icon: '🌌' },
  { id: 'ocean', name: 'Ocean Waves', icon: '🌊' },
  { id: 'aurora', name: 'Aurora', icon: '🌅' },
  { id: 'sakura', name: 'Sakura Petals', icon: '🌸' },
  { id: 'fireflies', name: 'Fireflies', icon: '✨' },
];

export default function ChatThemeModal({ currentTheme = 'default', onClose, onSave }) {
  const [selectedTheme, setSelectedTheme] = useState(currentTheme || 'default');
  const [intensity, setIntensity] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('zynk_theme_settings'))?.intensity ?? 0.5;
    } catch { return 0.5; }
  });
  const [enabled, setEnabled] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('zynk_theme_settings'))?.enabled ?? true;
    } catch { return true; }
  });

  const handleSave = () => {
    onSave(enabled ? selectedTheme : 'default', enabled, intensity);
  };

  return (
    <AnimatePresence>
      <motion.div 
        className="modal-overlay"
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div 
          className="modal-content glass"
          style={{
            width: '90%', maxWidth: '450px', maxHeight: '90vh',
            background: 'var(--bg-modal)', borderRadius: 'var(--radius-lg)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            border: '1px solid var(--border-light)'
          }}
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Chat Theme</h2>
            <button style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }} onClick={onClose}><X size={20} /></button>
          </div>

          <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Preview Window */}
          <div style={{ 
            height: '200px', 
            background: 'var(--bg-chat)', 
            borderRadius: 'var(--radius-md)', 
            position: 'relative', 
            overflow: 'hidden',
            border: '1px solid var(--border-color)'
          }}>
            <ThemeRenderer theme={selectedTheme} intensity={intensity} enabled={enabled} />
            <div style={{ position: 'absolute', bottom: '15px', right: '15px', background: 'var(--bg-msg-sent)', color: 'white', padding: '8px 12px', borderRadius: '12px 12px 0 12px', fontSize: '13px' }}>
              Preview message ✨
            </div>
            <div style={{ position: 'absolute', top: '15px', left: '15px', background: 'var(--bg-msg-received)', padding: '8px 12px', borderRadius: '12px 12px 12px 0', fontSize: '13px' }}>
              Looks beautiful!
            </div>
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 500 }}>Enable Animations</span>
            <label className="toggle-switch">
              <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
              <span className="slider"></span>
            </label>
          </div>

          <div style={{ opacity: enabled ? 1 : 0.5, pointerEvents: enabled ? 'auto' : 'none' }}>
            <div style={{ marginBottom: '12px', fontWeight: 500 }}>Select Theme</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
              {THEMES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTheme(t.id)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '12px 8px',
                    background: selectedTheme === t.id ? 'var(--bg-hover)' : 'transparent',
                    border: `1px solid ${selectedTheme === t.id ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)'
                  }}
                >
                  <span style={{ fontSize: '20px' }}>{t.icon}</span>
                  <span style={{ fontSize: '11px', textAlign: 'center' }}>{t.name}</span>
                </button>
              ))}
            </div>

            {selectedTheme !== 'default' && (
              <div style={{ marginTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                  <span>Intensity</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{Math.round(intensity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={intensity}
                  onChange={e => setIntensity(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent-primary)' }}
                />
              </div>
            )}
          </div>
          </div>

          <div style={{ padding: '15px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={handleSave}>Save Theme</button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
