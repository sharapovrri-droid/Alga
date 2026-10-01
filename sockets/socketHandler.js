const db = require('../config/db');

// Глобальные переменные состояния сервера
let stories = []; 
let onlineUsers = {}; 
let voiceRooms = {}; 
const ADMIN_USERS = ['Dep3kuu']; 
const bannedUsers = new Set(); 

module.exports = (io) => {
  // Утилита для удаления пользователя из голосовых комнат при отключении
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

  const getOnlineUsernames = () => Array.from(new Set(Object.values(onlineUsers).map(u => u.name)));

  io.on('connection', (socket) => {
    console.log(`🔌 Пользователь подключился: ${socket.id}`);

    // Синхронизация начального состояния при подключении
    socket.emit('update stories', stories);
    for (let room in voiceRooms) {
      socket.emit('voice room users', { room, users: voiceRooms[room] });
    }
    
    db.all(`SELECT * FROM chats`, [], (err, rows) => { 
      if (!err) socket.emit('load custom chats', rows); 
    });

    // Управление пользователями и профилем
    socket.on('user joined', (data) => {
      if (!data || !data.name) return;
      onlineUsers[socket.id] = data;
      socket.join(data.name);
      io.emit('online users', getOnlineUsernames());
    });

    socket.on('update avatar', (avatar) => { 
      if (onlineUsers[socket.id]) { 
        onlineUsers[socket.id].avatar = avatar; 
        io.emit('online users', getOnlineUsernames()); 
      } 
    });

    // Обработка отключения
    socket.on('disconnect', () => {
      console.log(`🔌 Пользователь отключился: ${socket.id}`);
      if (onlineUsers[socket.id]) { 
        delete onlineUsers[socket.id]; 
        io.emit('online users', getOnlineUsernames()); 
      }
      removeUserFromVoice(socket.id);
    });

    // Управление чатами и комнатами
    socket.on('create chat', (data) => {
      if (!data || !data.name) return;
      const chatId = 'chat_' + Date.now();
      db.run(`INSERT INTO chats (id, name, type, owner) VALUES (?, ?, ?, ?)`, 
        [chatId, data.name, data.type || 'channel', data.owner || 'System'], 
        (err) => {
          if (!err) {
            io.emit('chat created', { id: chatId, name: data.name, type: data.type, owner: data.owner });
          }
        }
      );
    });

    // История сообщений
    socket.on('get history', (room) => { 
      db.all(`SELECT * FROM messages WHERE room = ? ORDER BY timestamp ASC`, [room], (err, rows) => { 
        if (!err) socket.emit('load history', rows); 
      }); 
    });

    // Закрепление / Открепление сообщений
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

    // Отправка сообщений (текст, файлы, голосовые)
    socket.on('chat message', (data) => {
      if (!data || bannedUsers.has(data.user)) return; 
      
      const messageId = data.id || 'msg_' + Date.now() + Math.random().toString(36).substr(2, 9);
      const timestamp = data.timestamp || Date.now();
      
      const msgObj = { 
        id: messageId, 
        room: data.room, 
        user: data.user, 
        userAvatar: data.userAvatar, 
        text: data.text, 
        fileName: data.fileName, 
        fileData: data.fileData, 
        replyToId: data.replyToId,
        replyToUser: data.replyToUser, 
        replyToText: data.replyToText, 
        likes: 0, 
        timestamp, 
        duration: data.duration, 
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
      const user = onlineUsers[socket.id]?.name; 
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
      const user = onlineUsers[socket.id]?.name; 
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
      stories.push({ id: 'story_' + Date.now(), user: data.user, image: data.image }); 
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
        user: onlineUsers[socket.id]?.name || 'Guest', 
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