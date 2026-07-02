import React from 'react';
import { motion } from 'framer-motion';

export default function ActiveCallBanner({ callerName, callType, isGroup, onOpenCall }) {
  return (
    <motion.div
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -100, opacity: 0 }}
      transition={{ type: 'spring', damping: 20, stiffness: 200 }}
      onClick={onOpenCall}
      style={{
        position: 'fixed',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'linear-gradient(135deg, rgba(0,168,132,0.9), rgba(0,120,95,0.9))',
        backdropFilter: 'blur(10px)',
        color: 'white',
        padding: '12px 24px',
        borderRadius: '30px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        zIndex: 9999,
        cursor: 'pointer',
        border: '1px solid rgba(255,255,255,0.2)',
        maxWidth: '90%',
        whiteSpace: 'nowrap'
      }}
    >
      <div style={{
        width: '12px',
        height: '12px',
        borderRadius: '50%',
        background: '#fff',
        boxShadow: '0 0 10px #fff',
        animation: 'pulse 1.5s infinite ease-in-out'
      }}></div>
      <div style={{ fontWeight: '600', fontSize: '15px' }}>
        Tap to return to {callType === 'video' ? 'video' : 'voice'} call {isGroup ? 'in' : 'with'} {callerName}
      </div>
    </motion.div>
  );
}
