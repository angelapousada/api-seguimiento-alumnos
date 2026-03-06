const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');

router.get('/', auth, (req, res) => {
  // TODO: Listar grupos
  res.json({ message: 'Get grupos' });
});

router.post('/', auth, (req, res) => {
  // TODO: Crear grupo
  res.json({ message: 'Create grupo' });
});

module.exports = router;
