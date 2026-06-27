import React, { useState, useEffect, useRef } from 'react';
import ChatListItem from './ChatListItem';
import EmptyState from '../Common/EmptyState';
import { MessageSquarePlus } from 'lucide-react';
import { put } from '../../utils/api';
import { HexColorPicker } from 'react-colorful';

export default function ChatList({ conversations, selectedId, onSelect, onConversationUpdated }) {
  const [contextMenu, setContextMenu] = useState(null);
  const [colorPicker, setColorPicker] = useState(null);
  const [showHexPicker, setShowHexPicker] = useState(false);
  const [customColor, setCustomColor] = useState('#14B8A6');
  const menuRef = useRef(null);
  const pickerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setContextMenu(null);
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setColorPicker(null);
    };
    document.addEventListener('click', handleClickOutside);
    document.addEventListener('contextmenu', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('contextmenu', handleClickOutside);
    };
  }, []);

  if (!conversations || conversations.length === 0) {
    return (
      <EmptyState 
        icon={MessageSquarePlus}
        title="No Messages"
        message="Start a conversation with a friend to see it here."
      />
    );
  }

  const sortedConversations = [...conversations].sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    return 0; // maintain backend order (chronological)
  });

  const handleContextMenu = (e, conv) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      conversation: conv
    });
    setColorPicker(null);
  };

  const togglePin = async (conv, color = null) => {
    const isPinned = color ? 1 : (conv.is_pinned ? 0 : 1);
    const pinColor = color || null;
    
    // Optimistic update
    if (onConversationUpdated) {
      onConversationUpdated(conv.id, { is_pinned: isPinned, pinned_color: pinColor });
    }

    try {
      await put(`/messages/conversations/${conv.id}/pin`, { is_pinned: isPinned, pinned_color: pinColor });
    } catch (err) {
      console.error('Failed to update pin status', err);
      // Revert on error if necessary (we assume success for UI snappiness)
    }
    
    setContextMenu(null);
    setColorPicker(null);
  };

  const handlePinClick = () => {
    if (contextMenu.conversation.is_pinned) {
      togglePin(contextMenu.conversation);
    } else {
      setColorPicker({
        x: contextMenu.x,
        y: contextMenu.y,
        conversation: contextMenu.conversation
      });
      setContextMenu(null);
    }
  };

  const PIN_COLORS = [
    { id: 'gold', label: 'Gold', hex: '#FFB800' },
    { id: 'emerald', label: 'Emerald', hex: '#10B981' },
    { id: 'sapphire', label: 'Sapphire', hex: '#3B82F6' },
    { id: 'ruby', label: 'Ruby', hex: '#EF4444' },
    { id: 'amethyst', label: 'Amethyst', hex: '#8B5CF6' },
  ];

  return (
    <div style={{ position: 'relative' }}>
      {sortedConversations.map(c => (
        <ChatListItem 
          key={c.id} 
          conversation={c} 
          isSelected={c.id === selectedId} 
          onClick={() => onSelect(c)} 
          onContextMenu={handleContextMenu}
        />
      ))}
      
      {contextMenu && (
        <div 
          ref={menuRef}
          style={{
            position: 'fixed', top: contextMenu.y, left: contextMenu.x,
            background: 'var(--bg-modal)', border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-lg)', borderRadius: 'var(--radius-md)',
            padding: '4px', zIndex: 1000, minWidth: '140px'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button 
            className="context-menu-item"
            onClick={handlePinClick}
          >
            {contextMenu.conversation.is_pinned ? 'Unpin Chat' : 'Pin Chat'}
          </button>
        </div>
      )}

      {colorPicker && (
        <div 
          ref={pickerRef}
          style={{
            position: 'fixed', top: colorPicker.y, left: colorPicker.x,
            background: 'var(--bg-modal)', border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-lg)', borderRadius: 'var(--radius-md)',
            padding: '12px', zIndex: 1000, width: '200px'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>Select Pin Color</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {PIN_COLORS.map(color => (
              <div 
                key={color.id}
                onClick={() => togglePin(colorPicker.conversation, color.id)}
                title={color.label}
                style={{
                  width: '24px', height: '24px', borderRadius: '50%',
                  background: color.hex, cursor: 'pointer',
                  border: '2px solid transparent'
                }}
                className="hover-scale"
              />
            ))}
            <div 
              title="Custom Color"
              onClick={() => setShowHexPicker(!showHexPicker)}
              style={{
                width: '24px', height: '24px', borderRadius: '50%',
                cursor: 'pointer',
                border: showHexPicker ? '1px solid var(--accent-primary)' : '1px dashed var(--text-secondary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: showHexPicker ? 'rgba(20, 184, 166, 0.1)' : 'transparent'
              }}
              className="hover-scale"
            >
              <span style={{ fontSize: '16px', color: showHexPicker ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>+</span>
            </div>
          </div>
          
          {showHexPicker && (
            <div style={{ marginTop: '12px' }}>
              <HexColorPicker 
                color={customColor} 
                onChange={setCustomColor} 
                style={{ width: '100%', height: '120px' }}
              />
              <button 
                onClick={() => {
                  togglePin(colorPicker.conversation, customColor);
                  setShowHexPicker(false);
                }}
                style={{ marginTop: '8px', width: '100%', padding: '6px', background: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 600 }}
              >
                Apply Custom Color
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
