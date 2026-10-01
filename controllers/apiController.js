// Контроллер для обработки базовых API запросов
const getStatus = (req, res) => {
  res.json({ 
    message: 'API сервера Alga работает штатно', 
    status: 'success' 
  });
};

module.exports = {
  getStatus
};