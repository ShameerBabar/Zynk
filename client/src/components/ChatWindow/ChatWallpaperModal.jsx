import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Image, Upload } from 'lucide-react';
import { uploadAvatar } from '../../utils/api'; // Reuse avatar upload logic for images

const DEFAULT_WALLPAPERS = [
  { id: 'default', name: 'Default (None)', url: null, thumb: null },
  { id: 'mountains', name: 'Mountains', url: '/mountains.png', thumb: '/mountains.png' },
  { id: 'sky', name: 'Sky', url: '/sky.png', thumb: '/sky.png' },
  { id: 'beach', name: 'Beach', url: '/beach.png', thumb: '/beach.png' },
];

export default function ChatWallpaperModal({ currentWallpaper = null, onClose, onSave }) {
  const [selectedWallpaper, setSelectedWallpaper] = useState(() => {
    if (!currentWallpaper) return 'default';
    const preset = DEFAULT_WALLPAPERS.find(w => w.url === currentWallpaper);
    if (preset) return preset.id;
    return 'custom';
  });
  
  const [customUrl, setCustomUrl] = useState(() => {
    if (currentWallpaper && !DEFAULT_WALLPAPERS.find(w => w.url === currentWallpaper)) {
      return currentWallpaper;
    }
    return null;
  });

  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleSave = () => {
    let finalUrl = null;
    if (selectedWallpaper === 'custom') {
      finalUrl = customUrl;
    } else {
      const preset = DEFAULT_WALLPAPERS.find(w => w.id === selectedWallpaper);
      if (preset && preset.url) finalUrl = preset.url;
    }
    onSave(finalUrl);
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      const res = await uploadAvatar(file);
      if (res && res.url) {
        setCustomUrl(res.url);
        setSelectedWallpaper('custom');
      }
    } catch (err) {
      console.error('Wallpaper upload failed', err);
      alert('Failed to upload wallpaper');
    } finally {
      setUploading(false);
    }
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
          onClick={e => e.stopPropagation()}
        >
          <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>Chat Wallpaper</h2>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <X size={20} />
            </button>
          </div>

          <div style={{ padding: '20px' }}>
            <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
              Choose a background wallpaper for this chat. This only affects your view.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
              {DEFAULT_WALLPAPERS.map(w => (
                <div 
                  key={w.id}
                  onClick={() => setSelectedWallpaper(w.id)}
                  style={{
                    height: '80px',
                    borderRadius: '8px',
                    border: selectedWallpaper === w.id ? '2px solid var(--accent-primary)' : '2px solid var(--border-color)',
                    background: w.thumb ? `url(${w.thumb}) center/cover no-repeat` : 'var(--bg-active)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} />
                  <span style={{ position: 'relative', color: 'white', fontWeight: 600, fontSize: '13px', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                    {w.name}
                  </span>
                </div>
              ))}
              
              <div 
                onClick={() => {
                  if (customUrl) setSelectedWallpaper('custom');
                  else fileInputRef.current?.click();
                }}
                style={{
                  height: '80px',
                  borderRadius: '8px',
                  border: selectedWallpaper === 'custom' ? '2px solid var(--accent-primary)' : '2px dashed var(--border-color)',
                  background: customUrl ? `url(${customUrl}) center/cover no-repeat` : 'var(--bg-active)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                {customUrl && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} />}
                <span style={{ position: 'relative', color: 'white', fontWeight: 600, fontSize: '13px', textShadow: '0 1px 3px rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {uploading ? 'Uploading...' : customUrl ? 'Custom' : <><Upload size={14}/> Upload</>}
                </span>
                
                {customUrl && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                    style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '4px', color: 'white', padding: '2px 4px', fontSize: '10px', cursor: 'pointer' }}
                  >
                    Change
                  </button>
                )}
              </div>
            </div>

            <input 
              type="file" 
              accept="image/*" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              onChange={handleFileChange} 
            />

            <button 
              onClick={handleSave}
              disabled={uploading}
              style={{
                width: '100%',
                padding: '12px',
                background: 'var(--accent-primary)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '15px',
                cursor: uploading ? 'not-allowed' : 'pointer',
                opacity: uploading ? 0.7 : 1
              }}
            >
              Save Wallpaper
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
