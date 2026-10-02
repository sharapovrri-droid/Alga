// Контроллер для обработки API запросов
const getStatus = (req, res) => {
  res.json({ 
    message: 'API сервера Alga работает штатно', 
    status: 'success' 
  });
};

// Загрузка файла на сервер
const uploadFile = (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Файл не передан' });
  }

  // Возвращаем клиенту путь к сохранённому файлу на сервере
  const fileUrl = `/uploads/${req.file.filename}`;

  res.json({
    url: fileUrl,
    fileName: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size
  });
};

module.exports = {
  getStatus,
  uploadFile
};