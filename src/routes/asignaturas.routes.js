const express = require('express');
const db = require('../config/db');
const auth = require('../middlewares/auth');
const isAdmin = require('../middlewares/isAdmin');

const router = express.Router();

// GET /api/asignaturas - lista asignaturas activas (creada=1)
router.get('/', auth, (req, res) => {
  try {
    const asignaturas = db.prepare(
      'SELECT * FROM catalogo_asignaturas WHERE creada = 1 ORDER BY id_titulacion, curso, nombre'
    ).all();
    return res.json(asignaturas);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener asignaturas' });
  }
});

// GET /api/asignaturas/titulaciones - lista todas las titulaciones
router.get('/titulaciones', auth, (req, res) => {
  try {
    const titulaciones = db.prepare('SELECT * FROM titulaciones').all();
    return res.json(titulaciones);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener titulaciones' });
  }
});

// GET /api/asignaturas/catalogo - catálogo no activo con filtros opcionales
router.get('/catalogo', auth, (req, res) => {
  const { id_titulacion, curso } = req.query;

  try {
    let query = 'SELECT * FROM catalogo_asignaturas WHERE creada = 0';
    const params = [];

    if (id_titulacion) {
      query += ' AND id_titulacion = ?';
      params.push(id_titulacion);
    }
    if (curso) {
      query += ' AND curso = ?';
      params.push(curso);
    }

    query += ' ORDER BY curso, nombre';
    const asignaturas = db.prepare(query).all(...params);
    return res.json(asignaturas);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener catálogo' });
  }
});

// GET /api/asignaturas/:id - obtener asignatura por ID
router.get('/:id', auth, (req, res) => {
  try {
    const asignatura = db.prepare('SELECT * FROM catalogo_asignaturas WHERE id = ?').get(req.params.id);
    if (!asignatura) {
      return res.status(404).json({ error: 'Asignatura no encontrada' });
    }
    return res.json(asignatura);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener asignatura' });
  }
});

// POST /api/asignaturas/activar/:id - activar asignatura
router.post('/activar/:id', auth, isAdmin, (req, res) => {
  try {
    const result = db.prepare('UPDATE catalogo_asignaturas SET creada = 1 WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Asignatura no encontrada' });
    }
    const asignatura = db.prepare('SELECT * FROM catalogo_asignaturas WHERE id = ?').get(req.params.id);
    return res.json(asignatura);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al activar asignatura' });
  }
});

// POST /api/asignaturas/desactivar/:id - desactivar asignatura
router.post('/desactivar/:id', auth, isAdmin, (req, res) => {
  try {
    const result = db.prepare('UPDATE catalogo_asignaturas SET creada = 0 WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Asignatura no encontrada' });
    }
    const asignatura = db.prepare('SELECT * FROM catalogo_asignaturas WHERE id = ?').get(req.params.id);
    return res.json(asignatura);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al desactivar asignatura' });
  }
});

module.exports = router;
