const db = require('../config/db');

// Глобальные переменные состояния сервера
let stories = []; 
let onlineUsers = {}; // socket.id -> { name, avatar }
let voiceRooms = {}; 
const ADMIN_USERS = ['Dep3kuu']; 
const bannedUsers = new Set(); 

module.exports = (io) => {
  // Получение уникального списка имен пользователей онлайн
  const getOnlineUsernames = () => {
    return Array.from(new Set(Object.values(onlineUsers).map(u => u.name)));
  };

  // Удаление пользователя из голосовых комнат
  const removeUserFromVoice = (socketId) => {
    for (let room in voiceRooms) {
      const initialLen = voiceRooms[room].length;
      voiceRooms[room] = voiceRooms[room].filter(u => u.id !== socketId);
      if (voiceRooms[room].length !== initialLen) {
        io.emit('voice room users', { room, users: voiceRooms[room] });
        io.to('voice_' + room).emit('user-disconnected', socketId);
      }
    }
  };

  io.on('connection', (socket) => {
    console.log(`🔌 Пользователь подключился: ${socket.id}`);

    // 1. Сразу передаем подключившемуся актуальное состояние сервера
    socket.emit('online users', getOnlineUsernames());
    socket.emit('update stories', stories);
    for (let room in voiceRooms) {
      socket.emit('voice room users', { room, users: voiceRooms[room] });
    }
    
    db.all(`SELECT * FROM chats`, [], (err, rows) => { 
      if (!err && rows) socket.emit('load custom chats', rows); 
    });

    // 2. Вход пользователя в систему
    socket.on('user joined', (data) => {
      if (!data || !data.name) return;
      socket.username = data.name;
      onlineUsers[socket.id] = { name: data.name, avatar: data.avatar || null };
      socket.join(data.name);
      
      // Оповещаем всех об обновленном списке
      io.emit('online users', getOnlineUsernames());
    });

    // Обновление аватарки
    socket.on('update avatar', (avatar) => { 
      if (onlineUsers[socket.id]) { 
        onlineUsers[socket.id].avatar = avatar; 
        io.emit('online users', getOnlineUsernames()); 
      } 
    });

    // 3. Отключение пользователя
    socket.on('disconnect', () => {
      console.log(`🔌 Пользователь отключился: ${socket.id}`);
      if (onlineUsers[socket.id]) { 
        delete onlineUsers[socket.id]; 
        io.emit('online users', getOnlineUsernames()); 
      }
      removeUserFromVoice(socket.id);
    });

    // Создание чатов
    socket.on('create chat', (data) => {
      if (!data || !data.name) return;
      const creator = socket.username || data.owner || 'System';
      const chatId = 'chat_' + Date.now();
      db.run(`INSERT INTO chats (id, name, type, owner) VALUES (?, ?, ?, ?)`, 
        [chatId, data.name, data.type || 'channel', creator], 
        (err) => {
          if (!err) {
            io.emit('chat created', { id: chatId, name: data.name, type: data.type, owner: creator });
          }
        }
      );
    });

    // История сообщений
    socket.on('get history', (room) => { 
      db.all(`SELECT * FROM messages WHERE room = ? ORDER BY timestamp ASC`, [room], (err, rows) => { 
        if (!err && rows) socket.emit('load history', rows); 
      }); 
    });

    // Закрепление сообщений
    socket.on('pin message', (messageId) => { 
      db.run(`UPDATE messages SET isPinned = 1 WHERE id = ?`, [messageId], function(err) { 
        if (!err && this.changes > 0) io.emit('message pinned', messageId); 
      }); 
    });
    
    socket.on('unpin message', (messageId) => { 
      db.run(`UPDATE messages SET isPinned = 0 WHERE id = ?`, [messageId], function(err) { 
        if (!err && this.changes > 0) io.emit('message unpinned', messageId); 
      }); 
    });

    // Индикатор набора текста
    socket.on('typing', (data) => socket.broadcast.emit('typing', data));

    // Отправка сообщений
    socket.on('chat message', (data) => {
      const sender = socket.username || data.user;
      if (!data || !sender || bannedUsers.has(sender)) return; 
      
      const messageId = data.id || 'msg_' + Date.now() + Math.random().toString(36).substr(2, 9);
      const timestamp = data.timestamp || Date.now();
      
      const msgObj = { 
        id: messageId, 
        room: data.room, 
        user: sender, 
        userAvatar: data.userAvatar || onlineUsers[socket.id]?.avatar, 
        text: data.text || '', 
        fileName: data.fileName || null, 
        fileData: data.fileData || null, 
        replyToId: data.replyToId || null, 
        replyToUser: data.replyToUser || null, 
        replyToText: data.replyToText || null, 
        likes: 0, 
        timestamp, 
        duration: data.duration || null, 
        isPinned: 0 
      };

      db.run(`INSERT INTO messages (id, room, user, userAvatar, text, fileName, fileData, replyToId, replyToUser, replyToText, likes, timestamp, duration, isPinned) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0)`, 
        [msgObj.id, msgObj.room, msgObj.user, msgObj.userAvatar, msgObj.text, msgObj.fileName, msgObj.fileData, msgObj.replyToId, msgObj.replyToUser, msgObj.replyToText, msgObj.timestamp, msgObj.duration], 
        (err) => { 
          if (!err) io.emit('chat message', msgObj); 
        }
      );
    });

    // Удаление сообщений
    socket.on('delete message', (messageId) => {
      const user = socket.username || onlineUsers[socket.id]?.name; 
      if (!user) return;

      if (ADMIN_USERS.includes(user)) {
        db.run(`DELETE FROM messages WHERE id = ?`, [messageId], function(err) { 
          if (!err && this.changes > 0) io.emit('message deleted', messageId); 
        });
      } else {
        db.run(`DELETE FROM messages WHERE id = ? AND user = ?`, [messageId, user], function(err) { 
          if (!err && this.changes > 0) io.emit('message deleted', messageId); 
        });
      }
    });

    // Редактирование сообщений
    socket.on('edit message', (data) => {
      const user = socket.username || onlineUsers[socket.id]?.name; 
      if (!user || !data || !data.id) return;

      db.run(`UPDATE messages SET text = ? WHERE id = ? AND user = ?`, [data.newText, data.id, user], function(err) { 
        if (!err && this.changes > 0) io.emit('message edited', { id: data.id, text: data.newText }); 
      });
    });

    // Лайки и Истории (Stories)
    socket.on('like', (messageId) => { 
      db.run(`UPDATE messages SET likes = likes + 1 WHERE id = ?`, [messageId], (err) => { 
        if (!err) io.emit('like', messageId); 
      }); 
    });

    socket.on('new story', (data) => { 
      const sender = socket.username || data.user;
      stories.push({ id: 'story_' + Date.now(), user: sender, image: data.image }); 
      if (stories.length > 10) stories.shift(); 
      io.emit('update stories', stories); 
    });

    // Голосовые комнаты и WebRTC сигнализация
    socket.on('voice update', (data) => {
      if (voiceRooms[data.room]) {
        const user = voiceRooms[data.room].find(u => u.user === data.user);
        if (user) { 
          user.micMuted = data.micMuted; 
          user.headphonesMuted = data.headphonesMuted; 
          user.isSpeaking = data.isSpeaking; 
        }
        io.emit('voice room users', { room: data.room, users: voiceRooms[data.room] });
      }
    });

    socket.on('webrtc signal', (data) => socket.broadcast.emit('webrtc signal', data));

    socket.on('join voice', (room) => {
      removeUserFromVoice(socket.id); 
      const voiceRoom = 'voice_' + room;
      socket.join(voiceRoom);
      
      if (!voiceRooms[room]) voiceRooms[room] = [];
      voiceRooms[room].push({ 
        id: socket.id, 
        user: socket.username || onlineUsers[socket.id]?.name || 'Guest', 
        micMuted: true, 
        headphonesMuted: false, 
        isSpeaking: false 
      }); 
      
      io.emit('voice room users', { room, users: voiceRooms[room] });
      socket.to(voiceRoom).emit('user-connected', socket.id);
    });

    socket.on('leave voice', () => removeUserFromVoice(socket.id));
  });
};