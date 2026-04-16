const express = require('express');
const db = require('../config/db');
const auth = require('../middlewares/auth');

const router = express.Router();

// GET /api/grupos - lista grupos con filtros opcionales
router.get('/', auth, (req, res) => {
  const { id_asignatura, tipo } = req.query;

  try {
    let query = `
      SELECT g.*, u.nombre AS nombre_profesor, u.apellidos AS apellidos_profesor
      FROM grupos g
      LEFT JOIN usuarios u ON u.id = g.id_profesor
      WHERE 1=1
    `;
    const params = [];

    if (id_asignatura) {
      query += ' AND g.id_asignatura = ?';
      params.push(id_asignatura);
    }
    if (tipo) {
      query += ' AND g.tipo = ?';
      params.push(tipo);
    }

    query += ' ORDER BY g.nombre';
    const grupos = db.prepare(query).all(...params);
    return res.json(grupos);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener grupos' });
  }
});

// POST /api/grupos - crear grupo
router.post('/', auth, (req, res) => {
  const { nombre, tipo, aula, id_asignatura, id_profesor } = req.body;

  if (!nombre || !tipo || !id_asignatura) {
    return res.status(400).json({ error: 'nombre, tipo e id_asignatura son obligatorios' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO grupos (nombre, tipo, aula, id_asignatura, id_profesor)
      VALUES (?, ?, ?, ?, ?)
    `).run(nombre, tipo, aula || null, id_asignatura, id_profesor || null);

    const grupo = db.prepare('SELECT * FROM grupos WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json(grupo);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al crear grupo' });
  }
});

// DELETE /api/grupos/:id - eliminar grupo
router.delete('/:id', auth, (req, res) => {
  try {
    const result = db.prepare('DELETE FROM grupos WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    return res.json({ mensaje: 'Grupo eliminado correctamente' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al eliminar grupo' });
  }
});

// GET /api/grupos/:id/estudiantes - lista estudiantes del grupo
router.get('/:id/estudiantes', auth, (req, res) => {
  const { id } = req.params;

  try {
    const estudiantes = db.prepare(`
      SELECT
        eag.id,
        e.id AS id_estudiante,
        e.nombre,
        e.dni,
        e.correo,
        e.movilidad,
        e.ruta_imagen,
        ea.convocatorias,
        ea.matriculas,
        ea.matricula
      FROM estudiantes_asignatura_grupo eag
      JOIN estudiantes_asignatura ea ON ea.id = eag.id_estudiante_asignatura
      JOIN estudiantes e ON e.id = ea.id_estudiante
      WHERE eag.id_grupo = ?
      ORDER BY e.nombre
    `).all(id);

    return res.json(estudiantes);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener estudiantes del grupo' });
  }
});

module.exports = router;
