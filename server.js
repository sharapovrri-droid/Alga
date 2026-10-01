const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

// Подключаем наши модули
const apiRoutes = require('./routes/index');
const setupSockets = require('./sockets/socketHandler');

const app = express();
const server = http.createServer(app);

// Настраиваем Socket.io
const io = new Server(server, { 
  maxHttpBufferSize: 1e8, 
  cors: { origin: "*", methods: ["GET", "POST"] } 
});

// Middleware для обработки входящих данных
app.use(express.json());

// Подключаем маршруты
app.use('/api', apiRoutes);

// Запускаем логику сокетов
setupSockets(io);

// Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
});