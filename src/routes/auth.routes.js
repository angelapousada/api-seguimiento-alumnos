const express = require('express');
const router = express.Router();

// Rutas de autenticación
router.post('/login', (req, res) => {
  // TODO: Implementar lógica de login
  res.json({ message: 'Login endpoint' });
});

router.post('/register', (req, res) => {
  // TODO: Implementar lógica de registro
  res.json({ message: 'Register endpoint' });
});

module.exports = router;
