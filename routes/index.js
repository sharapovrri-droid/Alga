const express = require('express');
const router = express.Router();

// Подключаем наш контроллер
const apiController = require('../controllers/apiController');

// Направляем запрос по ссылке '/' прямо в контроллер
router.get('/', apiController.getStatus);

module.exports = router;