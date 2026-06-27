import React from 'react';
import { motion } from 'framer-motion';

export default function EmptyState({ icon: Icon, title, message, actionText, onAction }) {
  return (
    <motion.div 
      className="empty-state-container"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        width: '100%',
        padding: '2rem',
        textAlign: 'center',
        color: 'var(--text-secondary)'
      }}
    >
      <motion.div 
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.1, duration: 0.5, type: "spring", bounce: 0.5 }}
        style={{
          background: 'var(--bg-active)',
          borderRadius: 'var(--radius-full)',
          padding: '1.5rem',
          marginBottom: '1.5rem',
          color: 'var(--accent-primary)',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        <Icon size={48} strokeWidth={1.5} />
      </motion.div>
      
      <h3 style={{ 
        color: 'var(--text-primary)', 
        fontSize: 'var(--fs-lg)', 
        marginBottom: '0.5rem',
        fontWeight: '600'
      }}>
        {title}
      </h3>
      
      <p style={{ 
        maxWidth: '300px', 
        lineHeight: '1.5',
        marginBottom: actionText ? '2rem' : '0'
      }}>
        {message}
      </p>
      
      {actionText && (
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="btn-primary"
          onClick={onAction}
          style={{
            padding: '12px 24px',
            borderRadius: 'var(--radius-xl)',
            boxShadow: 'var(--shadow-glow)'
          }}
        >
          {actionText}
        </motion.button>
      )}
    </motion.div>
  );
}
