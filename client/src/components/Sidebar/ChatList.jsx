import React from 'react';
import ChatListItem from './ChatListItem';

export default function ChatList({ conversations, selectedId, onSelect }) {
  if (!conversations || conversations.length === 0) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        No conversations yet
      </div>
    );
  }

  return (
    <div>
      {conversations.map(c => (
        <ChatListItem 
          key={c.id} 
          conversation={c} 
          isSelected={c.id === selectedId} 
          onClick={() => onSelect(c)} 
        />
      ))}
    </div>
  );
}
