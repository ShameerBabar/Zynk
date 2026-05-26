const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const envUrl = import.meta.env?.VITE_API_URL;

export const SOCKET_URL = envUrl 
  ? envUrl 
  : (isDev 
      ? 'http://localhost:3001' 
      : 'https://zynk-server.onrender.com');

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

