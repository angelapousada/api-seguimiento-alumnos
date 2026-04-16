const express = require('express');
const db = require('../config/db');
const auth = require('../middlewares/auth');

const router = express.Router();

// GET /api/estudiantes/buscar?q=texto - buscar por nombre, DNI o correo
router.get('/buscar', auth, (req, res) => {
  const { q } = req.query;

  if (!q || q.trim() === '') {
    return res.status(400).json({ error: 'El parámetro q es obligatorio' });
  }

  try {
    const termino = `%${q.trim()}%`;
    const estudiantes = db.prepare(`
      SELECT * FROM estudiantes
      WHERE nombre LIKE ?
         OR dni LIKE ?
         OR correo LIKE ?
      ORDER BY nombre
      LIMIT 50
    `).all(termino, termino, termino);

    return res.json(estudiantes);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al buscar estudiantes' });
  }
});

module.exports = router;
