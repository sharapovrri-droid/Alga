import { io } from 'socket.io-client';

// Подключение с настройками автопереподключения
export const socket = io('http://localhost:3000', {
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  transports: ['websocket', 'polling']
});