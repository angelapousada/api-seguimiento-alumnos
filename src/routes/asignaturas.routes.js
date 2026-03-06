const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');

router.get('/', auth, (req, res) => {
  // TODO: Listar asignaturas
  res.json({ message: 'Get asignaturas' });
});

router.post('/', auth, (req, res) => {
  // TODO: Crear asignatura
  res.json({ message: 'Create asignatura' });
});

module.exports = router;
