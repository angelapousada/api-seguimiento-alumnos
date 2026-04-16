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

// DELETE /api/grupos/:id - eliminar grupo (si no tiene sesiones)
router.delete('/:id', auth, (req, res) => {
  const { id } = req.params;

  try {
    const grupo = db.prepare('SELECT * FROM grupos WHERE id = ?').get(id);
    if (!grupo) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }

    const sesionesCount = db.prepare('SELECT COUNT(*) as cnt FROM sesiones WHERE id_grupo = ?').get(id);
    const examenesCount = db.prepare('SELECT COUNT(*) as cnt FROM examenes WHERE id_grupo = ?').get(id);

    if (sesionesCount.cnt > 0 || examenesCount.cnt > 0) {
      return res.status(400).json({
        error: 'No se puede eliminar el grupo porque tiene sesiones o exámenes asignados',
        sesiones: sesionesCount.cnt,
        examenes: examenesCount.cnt
      });
    }

    db.prepare('DELETE FROM grupos WHERE id = ?').run(id);
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

// GET /api/grupos/:id/horarios - lista horarios del grupo
router.get('/:id/horarios', auth, (req, res) => {
  try {
    const horarios = db.prepare('SELECT * FROM horarios WHERE id_grupo = ? ORDER BY dia, hora_inicio').all(req.params.id);
    return res.json(horarios);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener horarios' });
  }
});

// PUT /api/grupos/:id - actualizar grupo
router.put('/:id', auth, (req, res) => {
  const { id } = req.params;
  const { nombre, tipo, aula, id_profesor } = req.body;

  try {
    const grupo = db.prepare('SELECT * FROM grupos WHERE id = ?').get(id);
    if (!grupo) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }

    db.prepare(`
      UPDATE grupos
      SET nombre = ?, tipo = ?, aula = ?, id_profesor = ?
      WHERE id = ?
    `).run(
      nombre !== undefined ? nombre : grupo.nombre,
      tipo !== undefined ? tipo : grupo.tipo,
      aula !== undefined ? aula : grupo.aula,
      id_profesor !== undefined ? id_profesor : grupo.id_profesor,
      id
    );

    const actualizado = db.prepare(`
      SELECT g.*, u.nombre AS nombre_profesor, u.apellidos AS apellidos_profesor
      FROM grupos g
      LEFT JOIN usuarios u ON u.id = g.id_profesor
      WHERE g.id = ?
    `).get(id);

    return res.json(actualizado);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al actualizar grupo' });
  }
});

// PUT /api/grupos/:id/horarios - actualizar horarios del grupo
router.put('/:id/horarios', auth, (req, res) => {
  const { id } = req.params;
  const { horarios } = req.body;

  if (!Array.isArray(horarios)) {
    return res.status(400).json({ error: 'horarios debe ser un array' });
  }

  try {
    const grupo = db.prepare('SELECT * FROM grupos WHERE id = ?').get(id);
    if (!grupo) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }

    const actualizar = db.transaction(() => {
      db.prepare('DELETE FROM horarios WHERE id_grupo = ?').run(id);

      const insertar = db.prepare(`
        INSERT INTO horarios (dia, hora_inicio, hora_fin, id_grupo)
        VALUES (?, ?, ?, ?)
      `);

      for (const h of horarios) {
        if (h.dia && h.hora_inicio && h.hora_fin) {
          insertar.run(h.dia, h.hora_inicio, h.hora_fin, id);
        }
      }
    });

    actualizar();

    const horariosActualizados = db.prepare('SELECT * FROM horarios WHERE id_grupo = ? ORDER BY dia, hora_inicio').all(id);
    return res.json(horariosActualizados);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al actualizar horarios' });
  }
});

module.exports = router;
