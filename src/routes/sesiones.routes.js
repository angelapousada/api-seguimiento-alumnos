const express = require('express');
const db = require('../config/db');
const auth = require('../middlewares/auth');

const router = express.Router();

// GET /api/sesiones - lista sesiones con filtro opcional por grupo
router.get('/', auth, (req, res) => {
  const { id_grupo } = req.query;

  try {
    let query = 'SELECT * FROM sesiones WHERE 1=1';
    const params = [];

    if (id_grupo) {
      query += ' AND id_grupo = ?';
      params.push(id_grupo);
    }

    query += ' ORDER BY fecha DESC, hora_inicio DESC';
    const sesiones = db.prepare(query).all(...params);

    // Adjuntar conceptos a cada sesión
    const getConceptos = db.prepare('SELECT * FROM conceptos WHERE id_sesion = ?');
    const resultado = sesiones.map((s) => ({
      ...s,
      conceptos: getConceptos.all(s.id),
    }));

    return res.json(resultado);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener sesiones' });
  }
});

// GET /api/sesiones/:id - obtener sesión con conceptos
router.get('/:id', auth, (req, res) => {
  try {
    const sesion = db.prepare('SELECT * FROM sesiones WHERE id = ?').get(req.params.id);
    if (!sesion) {
      return res.status(404).json({ error: 'Sesión no encontrada' });
    }
    const conceptos = db.prepare('SELECT * FROM conceptos WHERE id_sesion = ?').all(sesion.id);
    return res.json({ ...sesion, conceptos });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener sesión' });
  }
});

// POST /api/sesiones - crear sesión (con conceptos opcionales)
router.post('/', auth, (req, res) => {
  const { fecha, hora_inicio, hora_fin, aula, id_grupo, id_profesor, conceptos } = req.body;

  if (!fecha || !id_grupo) {
    return res.status(400).json({ error: 'fecha e id_grupo son obligatorios' });
  }

  try {
    const crearSesion = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO sesiones (fecha, hora_inicio, hora_fin, aula, id_grupo, id_profesor)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        fecha,
        hora_inicio || null,
        hora_fin || null,
        aula || null,
        id_grupo,
        id_profesor || null
      );

      const sesionId = result.lastInsertRowid;

      if (Array.isArray(conceptos) && conceptos.length > 0) {
        const insertConcepto = db.prepare(
          'INSERT INTO conceptos (descripcion, id_sesion) VALUES (?, ?)'
        );
        for (const desc of conceptos) {
          if (desc) insertConcepto.run(desc, sesionId);
        }
      }

      return sesionId;
    });

    const sesionId = crearSesion();
    const sesion = db.prepare('SELECT * FROM sesiones WHERE id = ?').get(sesionId);
    const conceptosGuardados = db.prepare('SELECT * FROM conceptos WHERE id_sesion = ?').all(sesionId);

    return res.status(201).json({ ...sesion, conceptos: conceptosGuardados });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al crear sesión' });
  }
});

// DELETE /api/sesiones/:id - eliminar sesión
router.delete('/:id', auth, (req, res) => {
  try {
    const result = db.prepare('DELETE FROM sesiones WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Sesión no encontrada' });
    }
    return res.json({ mensaje: 'Sesión eliminada correctamente' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al eliminar sesión' });
  }
});

// PUT /api/sesiones/:id - editar sesión
router.put('/:id', auth, (req, res) => {
  const { id } = req.params;
  const { fecha, hora_inicio, hora_fin, aula, id_grupo, id_profesor, conceptos } = req.body;

  try {
    const sesion = db.prepare('SELECT * FROM sesiones WHERE id = ?').get(id);
    if (!sesion) {
      return res.status(404).json({ error: 'Sesión no encontrada' });
    }

    const actualizar = db.transaction(() => {
      db.prepare(`
        UPDATE sesiones
        SET fecha = ?, hora_inicio = ?, hora_fin = ?, aula = ?, id_grupo = ?, id_profesor = ?
        WHERE id = ?
      `).run(
        fecha !== undefined ? fecha : sesion.fecha,
        hora_inicio !== undefined ? hora_inicio : sesion.hora_inicio,
        hora_fin !== undefined ? hora_fin : sesion.hora_fin,
        aula !== undefined ? aula : sesion.aula,
        id_grupo !== undefined ? id_grupo : sesion.id_grupo,
        id_profesor !== undefined ? id_profesor : sesion.id_profesor,
        id
      );

      if (Array.isArray(conceptos)) {
        db.prepare('DELETE FROM conceptos WHERE id_sesion = ?').run(id);
        const insertar = db.prepare('INSERT INTO conceptos (descripcion, id_sesion) VALUES (?, ?)');
        for (const desc of conceptos) {
          if (desc) insertar.run(desc, id);
        }
      }
    });

    actualizar();

    const sesionActualizada = db.prepare('SELECT * FROM sesiones WHERE id = ?').get(id);
    const conceptosActualizados = db.prepare('SELECT * FROM conceptos WHERE id_sesion = ?').all(id);

    return res.json({ ...sesionActualizada, conceptos: conceptosActualizados });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al editar sesión' });
  }
});

// GET /api/sesiones/:id/asistencias - lista asistencias de la sesión
router.get('/:id/asistencias', auth, (req, res) => {
  try {
    const asistencias = db.prepare(`
      SELECT
        a.id,
        a.asistencia,
        a.posicion,
        a.comentario,
        a.otro_grupo,
        a.id_sesion,
        a.id_estudiante_asignatura_grupo,
        e.nombre,
        e.dni,
        e.correo
      FROM asistencia_sesion a
      JOIN estudiantes_asignatura_grupo eag ON eag.id = a.id_estudiante_asignatura_grupo
      JOIN estudiantes_asignatura ea ON ea.id = eag.id_estudiante_asignatura
      JOIN estudiantes e ON e.id = ea.id_estudiante
      WHERE a.id_sesion = ?
      ORDER BY a.posicion, e.nombre
    `).all(req.params.id);

    return res.json(asistencias);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener asistencias' });
  }
});

// POST /api/sesiones/:id/asistencias - guardar asistencias (upsert)
router.post('/:id/asistencias', auth, (req, res) => {
  const { id } = req.params;
  const { id_estudiante_asignatura_grupo, asistencia, posicion, comentario, otro_grupo } = req.body;

  if (!id_estudiante_asignatura_grupo) {
    return res.status(400).json({ error: 'id_estudiante_asignatura_grupo es obligatorio' });
  }

  try {
    db.prepare(`
      INSERT INTO asistencia_sesion
        (id_sesion, id_estudiante_asignatura_grupo, asistencia, posicion, comentario, otro_grupo)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id_sesion, id_estudiante_asignatura_grupo)
      DO UPDATE SET
        asistencia = excluded.asistencia,
        posicion = excluded.posicion,
        comentario = excluded.comentario,
        otro_grupo = excluded.otro_grupo
    `).run(
      id,
      id_estudiante_asignatura_grupo,
      asistencia || 'No',
      posicion || 0,
      comentario || null,
      otro_grupo || 'No'
    );

    return res.json({ mensaje: 'Asistencia guardada correctamente' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al guardar asistencia' });
  }
});

// POST /api/sesiones/:id/entregas - guardar entregas
router.post('/:id/entregas', auth, (req, res) => {
  const { id } = req.params;
  const entregas = req.body;

  if (!Array.isArray(entregas)) {
    return res.status(400).json({ error: 'Se esperaba un array de entregas' });
  }

  try {
    const upsert = db.prepare(`
      INSERT INTO entregas (id_sesion, id_estudiante_asignatura_grupo, entrega, valoracion, comentario)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id_sesion, id_estudiante_asignatura_grupo)
      DO UPDATE SET
        entrega = excluded.entrega,
        valoracion = excluded.valoracion,
        comentario = excluded.comentario
    `);

    const guardar = db.transaction(() => {
      for (const e of entregas) {
        upsert.run(
          id,
          e.id_estudiante_asignatura_grupo,
          e.entrega || 'No',
          e.valoracion !== undefined ? e.valoracion : null,
          e.comentario || null
        );
      }
    });

    guardar();
    return res.json({ mensaje: 'Entregas guardadas correctamente' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al guardar entregas' });
  }
});

// GET /api/sesiones/:id/entregas - obtener entregas de la sesión
router.get('/:id/entregas', auth, (req, res) => {
  try {
    const entregas = db.prepare(`
      SELECT
        en.id,
        en.entrega,
        en.valoracion,
        en.comentario,
        en.id_sesion,
        en.id_estudiante_asignatura_grupo,
        e.nombre,
        e.dni
      FROM entregas en
      JOIN estudiantes_asignatura_grupo eag ON eag.id = en.id_estudiante_asignatura_grupo
      JOIN estudiantes_asignatura ea ON ea.id = eag.id_estudiante_asignatura
      JOIN estudiantes e ON e.id = ea.id_estudiante
      WHERE en.id_sesion = ?
      ORDER BY e.nombre
    `).all(req.params.id);

    return res.json(entregas);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener entregas' });
  }
});

// POST /api/sesiones/:id/valoraciones - guardar valoraciones
router.post('/:id/valoraciones', auth, (req, res) => {
  const { id } = req.params;
  const valoraciones = req.body;

  if (!Array.isArray(valoraciones)) {
    return res.status(400).json({ error: 'Se esperaba un array de valoraciones' });
  }

  try {
    const upsert = db.prepare(`
      INSERT INTO valoraciones (id_concepto, id_estudiante_asignatura_grupo, valoracion, comentario)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id_concepto, id_estudiante_asignatura_grupo)
      DO UPDATE SET
        valoracion = excluded.valoracion,
        comentario = excluded.comentario
    `);

    const guardar = db.transaction(() => {
      for (const v of valoraciones) {
        if (v.id_concepto && v.id_estudiante_asignatura_grupo) {
          upsert.run(
            v.id_concepto,
            v.id_estudiante_asignatura_grupo,
            v.valoracion !== undefined ? v.valoracion : null,
            v.comentario || null
          );
        }
      }
    });

    guardar();
    return res.json({ mensaje: 'Valoraciones guardadas correctamente' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al guardar valoraciones' });
  }
});

// GET /api/sesiones/:id/valoraciones - obtener valoraciones de la sesión
router.get('/:id/valoraciones', auth, (req, res) => {
  try {
    const valoraciones = db.prepare(`
      SELECT
        v.id,
        v.valoracion,
        v.comentario,
        v.id_concepto,
        v.id_estudiante_asignatura_grupo,
        c.descripcion AS concepto,
        e.nombre,
        e.dni
      FROM valoraciones v
      JOIN conceptos c ON c.id = v.id_concepto
      JOIN estudiantes_asignatura_grupo eag ON eag.id = v.id_estudiante_asignatura_grupo
      JOIN estudiantes_asignatura ea ON ea.id = eag.id_estudiante_asignatura
      JOIN estudiantes e ON e.id = ea.id_estudiante
      WHERE c.id_sesion = ?
      ORDER BY e.nombre, c.id
    `).all(req.params.id);

    return res.json(valoraciones);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener valoraciones' });
  }
});

module.exports = router;
