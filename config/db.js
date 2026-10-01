const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Подключаем базу данных в корне проекта
const dbPath = path.resolve(__dirname, '../chat.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Ошибка подключения к SQLite:', err.message);
  } else {
    console.log('✅ Успешное подключение к базе данных chat.db');
  }
});

// Инициализация структуры таблиц
db.serialize(() => {
  // Таблица сообщений с полной поддержкой ответов, медиа, лайков и закрепления
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    room TEXT NOT NULL,
    user TEXT NOT NULL,
    userAvatar TEXT,
    text TEXT,
    fileName TEXT,
    fileData TEXT,
    replyToId TEXT,
    replyToUser TEXT,
    replyToText TEXT,
    likes INTEGER DEFAULT 0,
    timestamp INTEGER NOT NULL,
    duration INTEGER,
    isPinned INTEGER DEFAULT 0
  )`);

  // Таблица чатов / комнат
  db.run(`CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    owner TEXT NOT NULL
  )`);
});

module.exports = db;