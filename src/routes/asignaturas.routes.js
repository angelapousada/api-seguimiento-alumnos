const express = require('express');
const db = require('../config/db');
const auth = require('../middlewares/auth');
const isAdmin = require('../middlewares/isAdmin');

const router = express.Router();

router.get('/', auth, (req, res) => {
  try {
    if (req.user.rol === 0) {
      const idsAsignadas = new Set();
      for (const u of db.prepare('SELECT ids_asignatura FROM usuarios').all()) {
        try {
          JSON.parse(u.ids_asignatura || '[]').forEach((x) => {
            const n = Number(x);
            if (!Number.isNaN(n)) idsAsignadas.add(n);
          });
        } catch (_) {  }
      }
      const lista = [...idsAsignadas];
      const ph = lista.length ? lista.map(() => '?').join(',') : 'NULL';
      const asignaturas = db.prepare(
        `SELECT ca.* FROM catalogo_asignaturas ca
         WHERE ca.creada = 1
            OR ca.id IN (${ph})
            OR EXISTS (SELECT 1 FROM grupos g WHERE g.id_asignatura = ca.id)
         ORDER BY ca.id_titulacion, ca.curso, ca.nombre`
      ).all(...lista);
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
         WHERE ca.id IN (${placeholders})
            OR EXISTS (
              SELECT 1 FROM grupos g
              WHERE g.id_asignatura = ca.id AND g.id_profesor IS NULL
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

router.get('/titulaciones', auth, (req, res) => {
  try {
    const titulaciones = db.prepare('SELECT * FROM titulaciones').all();
    return res.json(titulaciones);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener titulaciones' });
  }
});

router.get('/catalogo', auth, (req, res) => {
  const { id_titulacion, curso } = req.query;

  try {
    let query = 'SELECT * FROM catalogo_asignaturas WHERE 1 = 1';
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

router.get('/:id/profesores', auth, (req, res) => {
  try {
    const idAsignatura = String(req.params.id);
    const profesores = db
      .prepare('SELECT id, nombre, apellidos, ids_asignatura FROM usuarios')
      .all();

    const resultado = [];
    for (const p of profesores) {
      let ids = [];
      try {
        ids = JSON.parse(p.ids_asignatura || '[]');
      } catch (_) {
        ids = [];
      }
      if (ids.map(String).includes(idAsignatura)) {
        resultado.push({
          id: p.id,
          nombre: p.nombre,
          apellidos: p.apellidos,
        });
      }
    }
    return res.json(resultado);
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: 'Error al obtener profesores de la asignatura' });
  }
});

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

router.post('/guardar-carga', auth, (req, res) => {
  const { nombre, curso, titulacion, estudiantes, fecha_inicio, fecha_fin } = req.body;
  const idProfesor = req.user.id;

  if (!nombre || !estudiantes || !Array.isArray(estudiantes)) {
    return res.status(400).json({ error: 'nombre y estudiantes son obligatorios' });
  }

  try {
    const guardar = db.transaction(() => {
      let asignatura = db
        .prepare('SELECT id FROM catalogo_asignaturas WHERE nombre = ? AND creada = 1')
        .get(nombre);

      if (!asignatura) {
        let titulacionId = 'default';
        if (titulacion) {
          const exacta = db.prepare('SELECT id FROM titulaciones WHERE id = ?').get(titulacion);
          const contenida = exacta
            ? null
            : db.prepare("SELECT id FROM titulaciones WHERE ? LIKE '%' || nombre || '%'").get(titulacion);
          if (exacta) {
            titulacionId = exacta.id;
          } else if (contenida) {
            titulacionId = contenida.id;
          } else {
            const m = String(titulacion).match(/\(([^)]+)\)\s*$/);
            titulacionId = (m ? m[1] : titulacion).toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20) || 'default';
            if (!db.prepare('SELECT id FROM titulaciones WHERE id = ?').get(titulacionId)) {
              db.prepare('INSERT INTO titulaciones (id, nombre) VALUES (?, ?)').run(titulacionId, titulacion);
            }
          }
        }
        if (titulacionId === 'default' && !db.prepare('SELECT id FROM titulaciones WHERE id = ?').get('default')) {
          db.prepare('INSERT INTO titulaciones (id, nombre) VALUES (?, ?)').run('default', 'Sin titulación');
        }

        asignatura = db
          .prepare('SELECT id FROM catalogo_asignaturas WHERE nombre = ? AND id_titulacion = ?')
          .get(nombre, titulacionId);
        if (asignatura) {
          db.prepare(`
            UPDATE catalogo_asignaturas
            SET creada = 1, fecha_inicio = COALESCE(?, fecha_inicio), fecha_fin = COALESCE(?, fecha_fin)
            WHERE id = ?
          `).run(fecha_inicio || null, fecha_fin || null, asignatura.id);
        } else {
          const r = db.prepare(`
            INSERT INTO catalogo_asignaturas (nombre, codigo, id_titulacion, curso, creada, fecha_inicio, fecha_fin)
            VALUES (?, ?, ?, ?, 1, ?, ?)
          `).run(nombre, nombre.substring(0, 10).toUpperCase(), titulacionId, curso || '1', fecha_inicio || null, fecha_fin || null);
          asignatura = { id: r.lastInsertRowid };
        }
      } else {
        db.prepare(`
          UPDATE catalogo_asignaturas
          SET fecha_inicio = COALESCE(?, fecha_inicio), fecha_fin = COALESCE(?, fecha_fin)
          WHERE id = ?
        `).run(fecha_inicio || null, fecha_fin || null, asignatura.id);
      }

      const buscarEst = db.prepare('SELECT id FROM estudiantes WHERE dni = ?');
      const buscarEstSinDni = db.prepare('SELECT id FROM estudiantes WHERE nombre = ? AND dni IS NULL');
      const insertEst = db.prepare(`
        INSERT INTO estudiantes (dni, nombre, correo, movilidad, necesidades_especiales)
        VALUES (?, ?, ?, ?, ?)
      `);
      const buscarEA = db.prepare('SELECT id FROM estudiantes_asignatura WHERE id_estudiante = ? AND id_asignatura = ?');
      const insertEA = db.prepare(`
        INSERT INTO estudiantes_asignatura (id_estudiante, id_asignatura, convocatorias, matriculas, matricula, evaluacion_diferenciada)
        VALUES (?, ?, ?, ?, 'Si', ?)
      `);
      const updateEA = db.prepare(
        'UPDATE estudiantes_asignatura SET convocatorias = ?, matriculas = ?, evaluacion_diferenciada = ? WHERE id = ?'
      );
      const buscarGrupo = db.prepare('SELECT id FROM grupos WHERE id_asignatura = ? AND tipo = ? AND nombre = ?');
      const insertGrupo = db.prepare('INSERT INTO grupos (nombre, tipo, id_asignatura, id_profesor) VALUES (?, ?, ?, ?)');
      const buscarEAG = db.prepare('SELECT id FROM estudiantes_asignatura_grupo WHERE id_estudiante_asignatura = ? AND id_grupo = ?');
      const insertEAG = db.prepare('INSERT INTO estudiantes_asignatura_grupo (id_estudiante_asignatura, id_grupo) VALUES (?, ?)');

      const idGrupo = (tipo, nombreGrupo) => {
        if (!nombreGrupo) return null;
        let g = buscarGrupo.get(asignatura.id, tipo, nombreGrupo);
        if (!g) {
          const r = insertGrupo.run(nombreGrupo, tipo, asignatura.id, idProfesor);
          g = { id: r.lastInsertRowid };
        }
        return g.id;
      };
      const asignarGrupo = (eaId, gId) => {
        if (gId && !buscarEAG.get(eaId, gId)) insertEAG.run(eaId, gId);
      };

      for (const est of estudiantes) {
        let estudiante = est.dni ? buscarEst.get(est.dni) : null;
        if (!estudiante && !est.dni) estudiante = buscarEstSinDni.get(est.nombre);
        if (!estudiante) {
          const r = insertEst.run(
            est.dni || null, est.nombre || '', est.correo || null,
            est.movilidad || 'No', est.necesidades_especiales || 'No'
          );
          estudiante = { id: r.lastInsertRowid };
        }

        const convocatorias = parseInt(est.convocatorias) || 0;
        const matriculas = parseInt(est.matriculas) || 0;
        let ea = buscarEA.get(estudiante.id, asignatura.id);
        if (!ea) {
          const r = insertEA.run(estudiante.id, asignatura.id, convocatorias, matriculas, est.evaluacion_diferenciada || 'No');
          ea = { id: r.lastInsertRowid };
        } else {
          updateEA.run(convocatorias, matriculas, est.evaluacion_diferenciada || 'No', ea.id);
        }

        asignarGrupo(ea.id, idGrupo('Teoría', est.grupo_teoria));
        asignarGrupo(ea.id, idGrupo('Laboratorio', est.grupo_laboratorio));
        asignarGrupo(ea.id, idGrupo('Aula', est.grupo_aula));
        asignarGrupo(ea.id, idGrupo('Tutoría Grupal', est.grupo_tutoria));
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
