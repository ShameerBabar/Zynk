const hostname = window.location.hostname;
const isDev = 
  hostname === 'localhost' || 
  hostname === '127.0.0.1' || 
  hostname === '[::1]' ||
  hostname.endsWith('.local') ||
  /^192\.168\./.test(hostname) ||
  /^10\./.test(hostname) ||
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);

const envUrl = import.meta.env?.VITE_API_URL;

export const SOCKET_URL = envUrl 
  ? envUrl 
  : (isDev 
      ? `http://${hostname}:3001` 
      : 'https://shameer123-zynk-backend.hf.space');

export const API_BASE = `${SOCKET_URL}/api`;
export const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
export const MESSAGES_PER_PAGE = 50;
export const DEFAULT_AVATAR = null;
export const APP_NAME = 'Zynk';

export const getFileUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) return path;
  return `${SOCKET_URL}${path.startsWith('/') ? '' : '/'}${path}`;
};

