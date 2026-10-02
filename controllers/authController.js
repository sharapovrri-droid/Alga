const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

// Секретный ключ для подписи токенов (в проде выносится в .env)
const JWT_SECRET = process.env.JWT_SECRET || 'alga_secret_key_2026';

// Регистрация нового пользователя
const register = (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Логин и пароль обязательны' });
  }

  const cleanUsername = username.trim();
  if (cleanUsername.length < 3) {
    return res.status(400).json({ error: 'Логин должен быть не короче 3 символов' });
  }

  // Проверяем, существует ли уже пользователь
  db.get(`SELECT * FROM users WHERE username = ?`, [cleanUsername], async (err, user) => {
    if (err) return res.status(500).json({ error: 'Ошибка базы данных' });
    if (user) return res.status(400).json({ error: 'Пользователь с таким никнеймом уже существует' });

    try {
      // Хешируем пароль
      const hashedPassword = await bcrypt.hash(password, 10);
      const userId = 'usr_' + Date.now();
      const createdAt = Date.now();

      db.run(
        `INSERT INTO users (id, username, password, avatar, createdAt) VALUES (?, ?, ?, ?, ?)`,
        [userId, cleanUsername, hashedPassword, null, createdAt],
        function (insertErr) {
          if (insertErr) return res.status(500).json({ error: 'Не удалось создать аккаунт' });

          // Выдаем токен
          const token = jwt.sign({ id: userId, username: cleanUsername }, JWT_SECRET, { expiresIn: '7d' });
          res.status(201).json({
            token,
            user: { id: userId, username: cleanUsername, avatar: null }
          });
        }
      );
    } catch (e) {
      res.status(500).json({ error: 'Ошибка сервера при шифровании' });
    }
  });
};

// Вход в систему (логин)
const login = (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Укажите логин и пароль' });
  }

  db.get(`SELECT * FROM users WHERE username = ?`, [username.trim()], async (err, user) => {
    if (err) return res.status(500).json({ error: 'Ошибка базы данных' });
    if (!user) return res.status(401).json({ error: 'Неверный логин или пароль' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Неверный логин или пароль' });

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      user: { id: user.id, username: user.username, avatar: user.avatar }
    });
  });
};

// Проверка токена (автологин при обновлении страницы)
const verifyToken = (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Токен отсутствует' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    db.get(`SELECT id, username, avatar FROM users WHERE id = ?`, [decoded.id], (err, user) => {
      if (err || !user) return res.status(401).json({ error: 'Пользователь не найден' });
      res.json({ user });
    });
  } catch (err) {
    res.status(401).json({ error: 'Недействительный токен' });
  }
};

module.exports = {
  register,
  login,
  verifyToken,
  JWT_SECRET
};