const express = require('express');
const db = require('../config/db');
const auth = require('../middlewares/auth');
const isAdmin = require('../middlewares/isAdmin');

const router = express.Router();

// GET /api/asignaturas - lista asignaturas activas (creada=1)
// Admin (rol=0) ve todas. Profesor (rol=1) ve solo:
//  - asignaturas asociadas a su perfil (usuarios.ids_asignatura)
//  - asignaturas que tengan algún grupo sin profesor asignado (RF4.2)
router.get('/', auth, (req, res) => {
  try {
    if (req.user.rol === 0) {
      const asignaturas = db.prepare(
        'SELECT * FROM catalogo_asignaturas WHERE creada = 1 ORDER BY id_titulacion, curso, nombre'
      ).all();
      return res.json(asignaturas);
    }

    const usuario = db
      .prepare('SELECT ids_asignatura FROM usuarios WHERE id = ?')
      .get(req.user.id);

    let idsAsignadas = [];
    try {
      idsAsignadas = JSON.parse(usuario?.ids_asignatura || '[]')
        .map((x) => Number(x))
        .filter((x) => !Number.isNaN(x));
    } catch (_) {
      idsAsignadas = [];
    }

    const placeholders = idsAsignadas.length
      ? idsAsignadas.map(() => '?').join(',')
      : 'NULL';

    const asignaturas = db
      .prepare(
        `SELECT DISTINCT ca.*
         FROM catalogo_asignaturas ca
         WHERE ca.creada = 1
           AND (
             ca.id IN (${placeholders})
             OR EXISTS (
               SELECT 1 FROM grupos g
               WHERE g.id_asignatura = ca.id AND g.id_profesor IS NULL
             )
           )
         ORDER BY ca.id_titulacion, ca.curso, ca.nombre`
      )
      .all(...idsAsignadas);

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

// PUT /api/asignaturas/:id - actualizar fechas u otros campos editables
router.put('/:id', auth, (req, res) => {
  const { fecha_inicio, fecha_fin } = req.body;
  try {
    const result = db.prepare(`
      UPDATE catalogo_asignaturas
      SET fecha_inicio = COALESCE(?, fecha_inicio),
          fecha_fin = COALESCE(?, fecha_fin)
      WHERE id = ?
    `).run(fecha_inicio ?? null, fecha_fin ?? null, req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Asignatura no encontrada' });
    }
    const asignatura = db.prepare('SELECT * FROM catalogo_asignaturas WHERE id = ?').get(req.params.id);
    return res.json(asignatura);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al actualizar asignatura' });
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

// POST /api/asignaturas/guardar-carga - guardar asignatura cargada desde SIES con estudiantes
router.post('/guardar-carga', auth, (req, res) => {
  const { nombre, curso, titulacion, estudiantes, fecha_inicio, fecha_fin } = req.body;

  if (!nombre || !estudiantes || !Array.isArray(estudiantes)) {
    return res.status(400).json({ error: 'nombre y estudiantes son obligatorios' });
  }

  try {
    const guardar = db.transaction(() => {
      const titulacionRow = db.prepare('SELECT id FROM titulaciones WHERE id = ? OR nombre LIKE ?').get(titulacion, `%${titulacion}%`);
      let titulacionId = titulacionRow?.id || 'default';

      if (!titulacionRow) {
        db.prepare('INSERT INTO titulaciones (id, nombre) VALUES (?, ?)').run(titulacionId, titulacion);
      }

      let asignatura = db.prepare('SELECT id FROM catalogo_asignaturas WHERE nombre = ? AND id_titulacion = ?').get(nombre, titulacionId);

      if (!asignatura) {
        const r = db.prepare(`
          INSERT INTO catalogo_asignaturas (nombre, codigo, id_titulacion, curso, creada, fecha_inicio, fecha_fin)
          VALUES (?, ?, ?, ?, 1, ?, ?)
        `).run(nombre, nombre.substring(0, 10).toUpperCase(), titulacionId, curso || '1', fecha_inicio || null, fecha_fin || null);
        asignatura = { id: r.lastInsertRowid };
      } else {
        db.prepare(`
          UPDATE catalogo_asignaturas
          SET creada = 1,
              fecha_inicio = COALESCE(?, fecha_inicio),
              fecha_fin = COALESCE(?, fecha_fin)
          WHERE id = ?
        `).run(fecha_inicio || null, fecha_fin || null, asignatura.id);
      }

      for (const est of estudiantes) {
        let estudiante = db.prepare('SELECT id FROM estudiantes WHERE dni = ?').get(est.dni);

        if (!estudiante && est.dni) {
          const r = db.prepare(`
            INSERT INTO estudiantes (dni, nombre, correo, movilidad)
            VALUES (?, ?, ?, ?)
          `).run(est.dni, est.nombre, est.correo, est.movilidad || 'No');
          estudiante = { id: r.lastInsertRowid };
        }

        if (!estudiante) {
          estudiante = db.prepare('SELECT id FROM estudiantes WHERE nombre = ? AND dni IS NULL').get(est.nombre);
          if (!estudiante) {
            const r = db.prepare(`
              INSERT INTO estudiantes (nombre, correo, movilidad)
              VALUES (?, ?, ?)
            `).run(est.nombre, est.correo, est.movilidad || 'No');
            estudiante = { id: r.lastInsertRowid };
          }
        }

        let ea = db.prepare('SELECT id FROM estudiantes_asignatura WHERE id_estudiante = ? AND id_asignatura = ?').get(estudiante.id, asignatura.id);

        if (!ea) {
          const r = db.prepare(`
            INSERT INTO estudiantes_asignatura (id_estudiante, id_asignatura, matricula)
            VALUES (?, ?, ?)
          `).run(estudiante.id, asignatura.id, 'Si');
          ea = { id: r.lastInsertRowid };
        }
      }

      return asignatura;
    });

    const asignatura = guardar();
    const asignaturaCompleta = db.prepare('SELECT * FROM catalogo_asignaturas WHERE id = ?').get(asignatura.id);

    return res.status(201).json(asignaturaCompleta);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al guardar la carga' });
  }
});

module.exports = router;
