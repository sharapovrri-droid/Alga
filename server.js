const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

// Подключаем модули
const apiRoutes = require('./routes/index');
const setupSockets = require('./sockets/socketHandler');

const app = express();
const server = http.createServer(app);

// Настраиваем Socket.io
const io = new Server(server, { 
  maxHttpBufferSize: 1e8, 
  cors: { origin: "*", methods: ["GET", "POST"] } 
});

// Настройка CORS для HTTP-запросов (загрузка файлов из React)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Middleware для обработки входящих JSON-данных
app.use(express.json());

// Раздача сохранённых файлов и картинок из папки uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Подключаем маршруты API
app.use('/api', apiRoutes);

// Запускаем логику сокетов
setupSockets(io);

// Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
});