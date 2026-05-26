import { useSocketContext } from '../context/SocketContext';

export function useOnlineStatus(userId) {
  const { onlineUsers } = useSocketContext();
  return onlineUsers.has(userId);
}
