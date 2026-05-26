export function parseTimestamp(timestamp) {
  if (!timestamp) return null;
  if (timestamp instanceof Date) return timestamp;
  
  // Convert SQLite space-separated UTC timestamps (e.g. "2026-05-26 16:36:00") to ISO-8601 UTC format
  if (typeof timestamp === 'string') {
    if (timestamp.includes(' ') && !timestamp.includes('T') && !timestamp.includes('Z') && !timestamp.includes('+')) {
      const hasOffset = timestamp.slice(10).includes('-');
      if (!hasOffset) {
        return new Date(timestamp.replace(' ', 'T') + 'Z');
      }
    }
  }
  
  return new Date(timestamp);
}

export function formatMessageTime(timestamp) {
  if (!timestamp) return '';
  const d = parseTimestamp(timestamp);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function formatRelativeTime(timestamp) {
  if (!timestamp) return '';
  const d = parseTimestamp(timestamp);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  
  // Yesterday
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.getDate() === yesterday.getDate() && d.getMonth() === yesterday.getMonth() && d.getFullYear() === yesterday.getFullYear()) {
    return 'Yesterday';
  }
  
  // Older
  return d.toLocaleDateString();
}

export function formatDateSeparator(timestamp) {
  if (!timestamp) return '';
  const d = parseTimestamp(timestamp);
  const now = new Date();
  
  if (d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
    return 'Today';
  }
  
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.getDate() === yesterday.getDate() && d.getMonth() === yesterday.getMonth() && d.getFullYear() === yesterday.getFullYear()) {
    return 'Yesterday';
  }
  
  const diffTime = Math.abs(now - d);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
  
  if (diffDays < 7) {
    return d.toLocaleDateString(undefined, { weekday: 'long' });
  }
  
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

export function formatLastSeen(timestamp) {
  if (!timestamp) return 'offline';
  const d = parseTimestamp(timestamp);
  const now = new Date();
  
  if (d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
    return `last seen today at ${formatMessageTime(timestamp)}`;
  }
  
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.getDate() === yesterday.getDate() && d.getMonth() === yesterday.getMonth() && d.getFullYear() === yesterday.getFullYear()) {
    return `last seen yesterday at ${formatMessageTime(timestamp)}`;
  }
  
  return `last seen ${d.toLocaleDateString()} at ${formatMessageTime(timestamp)}`;
}
