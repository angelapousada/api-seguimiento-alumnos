const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');

router.get('/', auth, (req, res) => {
  // TODO: Listar exámenes
  res.json({ message: 'Get exámenes' });
});

router.post('/', auth, (req, res) => {
  // TODO: Crear examen
  res.json({ message: 'Create examen' });
});

module.exports = router;
