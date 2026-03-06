const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');

router.get('/', auth, (req, res) => {
  // TODO: Listar sesiones
  res.json({ message: 'Get sesiones' });
});

router.post('/', auth, (req, res) => {
  // TODO: Crear sesión
  res.json({ message: 'Create sesión' });
});

module.exports = router;
