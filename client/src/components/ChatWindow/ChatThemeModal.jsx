import React, { useState } from 'react';
import { X, Check } from 'lucide-react';
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
  const [intensity, setIntensity] = useState(0.5);
  const [enabled, setEnabled] = useState(true);

  const handleSave = () => {
    // If not enabled, we just save 'default'
    onSave(enabled ? selectedTheme : 'default');
  };

  return (
    <div className="modal-overlay glass" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Chat Theme</h2>
          <button className="icon-btn interactive" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
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

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave}>Save Theme</button>
        </div>
      </div>
    </div>
  );
}
