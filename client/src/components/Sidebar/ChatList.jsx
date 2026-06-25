import React from 'react';
import ChatListItem from './ChatListItem';
import EmptyState from '../Common/EmptyState';
import { MessageSquarePlus } from 'lucide-react';

export default function ChatList({ conversations, selectedId, onSelect }) {
  if (!conversations || conversations.length === 0) {
    return (
      <EmptyState 
        icon={MessageSquarePlus}
        title="No Messages"
        message="Start a conversation with a friend to see it here."
      />
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
