const express = require('express');
const db = require('../config/db');
const auth = require('../middlewares/auth');

const router = express.Router();

// GET /api/examenes - lista exámenes con filtro opcional por grupo
router.get('/', auth, (req, res) => {
  const { id_grupo } = req.query;

  try {
    let query = 'SELECT * FROM examenes WHERE 1=1';
    const params = [];

    if (id_grupo) {
      query += ' AND id_grupo = ?';
      params.push(id_grupo);
    }

    query += ' ORDER BY fecha DESC';
    const examenes = db.prepare(query).all(...params);
    return res.json(examenes);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener exámenes' });
  }
});

// GET /api/examenes/:id - obtener examen por ID
router.get('/:id', auth, (req, res) => {
  try {
    const examen = db.prepare('SELECT * FROM examenes WHERE id = ?').get(req.params.id);
    if (!examen) {
      return res.status(404).json({ error: 'Examen no encontrado' });
    }
    return res.json(examen);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener examen' });
  }
});

// POST /api/examenes - crear examen
router.post('/', auth, (req, res) => {
  const { fecha, nombre, hora_inicio, aulas, id_grupo } = req.body;

  if (!fecha || !nombre || !id_grupo) {
    return res.status(400).json({ error: 'fecha, nombre e id_grupo son obligatorios' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO examenes (fecha, nombre, hora_inicio, aulas, id_grupo)
      VALUES (?, ?, ?, ?, ?)
    `).run(fecha, nombre, hora_inicio || null, aulas || null, id_grupo);

    const examen = db.prepare('SELECT * FROM examenes WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json(examen);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al crear examen' });
  }
});

// DELETE /api/examenes/:id - eliminar examen
router.delete('/:id', auth, (req, res) => {
  try {
    const result = db.prepare('DELETE FROM examenes WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Examen no encontrado' });
    }
    return res.json({ mensaje: 'Examen eliminado correctamente' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al eliminar examen' });
  }
});

// GET /api/examenes/:id/asistencias - lista asistencias al examen
router.get('/:id/asistencias', auth, (req, res) => {
  try {
    const asistencias = db.prepare(`
      SELECT
        a.id,
        a.asistencia,
        a.comentario,
        a.id_examen,
        a.id_estudiante_asignatura_grupo,
        e.nombre,
        e.dni
      FROM asistencia_examen a
      JOIN estudiantes_asignatura_grupo eag ON eag.id = a.id_estudiante_asignatura_grupo
      JOIN estudiantes_asignatura ea ON ea.id = eag.id_estudiante_asignatura
      JOIN estudiantes e ON e.id = ea.id_estudiante
      WHERE a.id_examen = ?
      ORDER BY e.nombre
    `).all(req.params.id);

    return res.json(asistencias);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener asistencias del examen' });
  }
});

// POST /api/examenes/:id/asistencias - guardar asistencias al examen (upsert)
router.post('/:id/asistencias', auth, (req, res) => {
  const { id } = req.params;
  const asistencias = req.body;

  if (!Array.isArray(asistencias)) {
    return res.status(400).json({ error: 'Se esperaba un array de asistencias' });
  }

  try {
    const upsert = db.prepare(`
      INSERT INTO asistencia_examen
        (id_examen, id_estudiante_asignatura_grupo, asistencia, comentario)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id_examen, id_estudiante_asignatura_grupo)
      DO UPDATE SET
        asistencia = excluded.asistencia,
        comentario = excluded.comentario
    `);

    const guardarTodas = db.transaction(() => {
      for (const a of asistencias) {
        upsert.run(
          id,
          a.id_estudiante_asignatura_grupo,
          a.asistencia || 'No',
          a.comentario || null
        );
      }
    });

    guardarTodas();
    return res.json({ mensaje: 'Asistencias al examen guardadas correctamente' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al guardar asistencias del examen' });
  }
});

module.exports = router;
