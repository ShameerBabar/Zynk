import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../../context/AuthContext';
import { showToast } from '../Common/Toast';

export default function InvitePanel({ onClose }) {
  const { user } = useAuth();
  const inviteUrl = `http://localhost:5173/invite/${user?.username}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(inviteUrl);
    showToast('Invite link copied to clipboard!', 'success');
  };

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
      background: 'var(--bg-app)', zIndex: 100, display: 'flex', flexDirection: 'column'
    }} className="slide-in-left">
      <div style={{ height: 'var(--header-height)', display: 'flex', alignItems: 'center', padding: '0 16px', background: 'var(--bg-active)' }}>
        <button onClick={onClose} style={{ marginRight: '16px', color: 'var(--text-primary)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"></path></svg>
        </button>
        <span style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '18px' }}>Invite Friends</span>
      </div>

      <div style={{ padding: '30px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, overflowY: 'auto' }}>
        <h2 style={{ color: 'var(--text-primary)', marginBottom: '10px', textAlign: 'center' }}>Connect on Zynk</h2>
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '30px' }}>
          Scan this QR code with a phone or share your personal link to start chatting instantly.
        </p>

        <div style={{ background: 'white', padding: '20px', borderRadius: '12px', marginBottom: '30px', boxShadow: 'var(--shadow-md)' }}>
          <QRCodeSVG value={inviteUrl} size={200} />
        </div>

        <div style={{ width: '100%', maxWidth: '300px' }}>
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Your Invite Link</div>
          <div style={{ 
            display: 'flex', alignItems: 'center', background: 'var(--bg-sidebar)', 
            padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' 
          }}>
            <input 
              type="text" 
              value={inviteUrl} 
              readOnly 
              style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none' }}
            />
            <button 
              onClick={copyToClipboard}
              style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontWeight: 'bold' }}
            >
              COPY
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
