import React from 'react';
import { motion } from 'framer-motion';
import './TypingIndicator.css';

export default function TypingIndicator({ names }) {
  if (!names || names.length === 0) return null;

  let text = '';
  if (names.length === 1) {
    text = `${names[0]} is typing`;
  } else if (names.length === 2) {
    text = `${names[0]} and ${names[1]} are typing`;
  } else if (names.length > 2) {
    text = 'Several people are typing';
  }

  return (
    <motion.div 
      className="typing-indicator"
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
    >
      <span className="typing-text">{text}</span>
      <div className="typing-dots">
        <motion.span animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0 }} className="dot" />
        <motion.span animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.15 }} className="dot" />
        <motion.span animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.3 }} className="dot" />
      </div>
    </motion.div>
  );
}
