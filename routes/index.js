const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const apiController = require('../controllers/apiController');

// Создаем папку uploads в корне проекта, если её ещё нет
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Настройка сохранения файлов на диск с уникальными именами
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `file-${uniqueSuffix}${ext}`);
  }
});

// Ограничение размера файла (максимум 25 МБ)
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }
});

// Роуты
router.get('/', apiController.getStatus);
router.post('/upload', upload.single('file'), apiController.uploadFile);

module.exports = router;