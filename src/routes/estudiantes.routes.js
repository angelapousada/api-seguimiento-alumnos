const express = require('express');
const db = require('../config/db');
const auth = require('../middlewares/auth');

const router = express.Router();

// GET /api/estudiantes/buscar?q=texto[&id_asignatura=X&excluir_grupo=Y]
// Si se pasa id_asignatura, devuelve además id_estudiante_asignatura y filtra
// solo a estudiantes matriculados en esa asignatura. Si además se pasa
// excluir_grupo, omite los que ya están en ese grupo.
router.get('/buscar', auth, (req, res) => {
  const { q, id_asignatura, excluir_grupo } = req.query;

  if (!q || q.trim() === '') {
    return res.status(400).json({ error: 'El parámetro q es obligatorio' });
  }

  try {
    const termino = `%${q.trim()}%`;

    if (id_asignatura) {
      const params = [id_asignatura, termino, termino, termino];
      let sql = `
        SELECT
          e.id, e.dni, e.nombre, e.correo, e.movilidad, e.ruta_imagen,
          ea.id AS id_estudiante_asignatura,
          ea.matricula, ea.convocatorias, ea.matriculas
        FROM estudiantes e
        JOIN estudiantes_asignatura ea ON ea.id_estudiante = e.id
        WHERE ea.id_asignatura = ?
          AND (e.nombre LIKE ? OR e.dni LIKE ? OR e.correo LIKE ?)
      `;
      if (excluir_grupo) {
        sql += `
          AND ea.id NOT IN (
            SELECT id_estudiante_asignatura
            FROM estudiantes_asignatura_grupo
            WHERE id_grupo = ?
          )
        `;
        params.push(excluir_grupo);
      }
      sql += ' ORDER BY e.nombre LIMIT 50';
      return res.json(db.prepare(sql).all(...params));
    }

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

// GET /api/estudiantes/:id - obtener datos personales del estudiante
router.get('/:id', auth, (req, res) => {
  try {
    const estudiante = db.prepare('SELECT * FROM estudiantes WHERE id = ?').get(req.params.id);
    if (!estudiante) {
      return res.status(404).json({ error: 'Estudiante no encontrado' });
    }

    const asignaturas = db.prepare(`
      SELECT
        ea.id AS id_estudiante_asignatura,
        ea.convocatorias,
        ea.matriculas,
        ea.matricula,
        ca.id AS id_asignatura,
        ca.nombre AS asignatura,
        ca.curso,
        t.nombre AS titulacion
      FROM estudiantes_asignatura ea
      JOIN catalogo_asignaturas ca ON ca.id = ea.id_asignatura
      LEFT JOIN titulaciones t ON t.id = ca.id_titulacion
      WHERE ea.id_estudiante = ?
      ORDER BY ca.curso, ca.nombre
    `).all(req.params.id);

    return res.json({
      ...estudiante,
      asignaturas
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener datos del estudiante' });
  }
});

// POST /api/estudiantes - crear nuevo estudiante manualmente
router.post('/', auth, (req, res) => {
  const { dni, nombre, correo, movilidad } = req.body;

  if (!nombre) {
    return res.status(400).json({ error: 'nombre es obligatorio' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO estudiantes (dni, nombre, correo, movilidad)
      VALUES (?, ?, ?, ?)
    `).run(dni || null, nombre, correo || null, movilidad || 'No');

    const nuevo = db.prepare('SELECT * FROM estudiantes WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json(nuevo);
  } catch (err) {
    console.error(err);
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'El DNI o correo ya existe' });
    }
    return res.status(500).json({ error: 'Error al crear estudiante' });
  }
});

// PUT /api/estudiantes/:id - actualizar estudiante
router.put('/:id', auth, (req, res) => {
  const { id } = req.params;
  const { nombre, correo, movilidad, ruta_imagen } = req.body;

  try {
    const estudiante = db.prepare('SELECT * FROM estudiantes WHERE id = ?').get(id);
    if (!estudiante) {
      return res.status(404).json({ error: 'Estudiante no encontrado' });
    }

    db.prepare(`
      UPDATE estudiantes
      SET nombre = ?, correo = ?, movilidad = ?, ruta_imagen = ?
      WHERE id = ?
    `).run(
      nombre !== undefined ? nombre : estudiante.nombre,
      correo !== undefined ? correo : estudiante.correo,
      movilidad !== undefined ? movilidad : estudiante.movilidad,
      ruta_imagen !== undefined ? ruta_imagen : estudiante.ruta_imagen,
      id
    );

    const actualizado = db.prepare('SELECT * FROM estudiantes WHERE id = ?').get(id);
    return res.json(actualizado);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al actualizar estudiante' });
  }
});

// GET /api/estudiantes/:id/estadisticas - obtener estadísticas del estudiante
router.get('/:id/estadisticas', auth, (req, res) => {
  const { id } = req.params;
  const { id_asignatura } = req.query;

  try {
    const estudiante = db.prepare('SELECT * FROM estudiantes WHERE id = ?').get(id);
    if (!estudiante) {
      return res.status(404).json({ error: 'Estudiante no encontrado' });
    }

    let queryAsignaturas = `
      SELECT
        ea.id AS id_estudiante_asignatura,
        ca.nombre AS asignatura,
        ca.curso,
        ea.convocatorias,
        ea.matriculas
      FROM estudiantes_asignatura ea
      JOIN catalogo_asignaturas ca ON ca.id = ea.id_asignatura
      WHERE ea.id_estudiante = ?
    `;
    const paramsAsignaturas = [id];

    if (id_asignatura) {
      queryAsignaturas += ' AND ea.id_asignatura = ?';
      paramsAsignaturas.push(id_asignatura);
    }

    const asignaturas = db.prepare(queryAsignaturas).all(...paramsAsignaturas);

    const estadisticas = [];

    for (const ea of asignaturas) {
      const grupos = db.prepare(`
        SELECT g.id, g.nombre, g.tipo
        FROM estudiantes_asignatura_grupo eag
        JOIN grupos g ON g.id = eag.id_grupo
        WHERE eag.id_estudiante_asignatura = ?
      `).all(ea.id_estudiante_asignatura);

      let totalSesiones = 0;
      let sesionesAsistidas = 0;
      const anotacionesSesiones = [];

      let totalExamenes = 0;
      let examenesAsistidos = 0;
      const anotacionesExamenes = [];

      let totalEntregas = 0;
      let entregasRealizadas = 0;

      for (const grupo of grupos) {
        const sesionesDelGrupo = db.prepare(`
          SELECT s.id, s.fecha
          FROM sesiones s
          WHERE s.id_grupo = ?
        `).all(grupo.id);

        for (const sesion of sesionesDelGrupo) {
          totalSesiones++;
          const asistencia = db.prepare(`
            SELECT asistencia, comentario FROM asistencia_sesion
            WHERE id_sesion = ? AND id_estudiante_asignatura_grupo = ?
          `).get(sesion.id, ea.id_estudiante_asignatura);

          if (asistencia) {
            if (asistencia.asistencia === 'Si') sesionesAsistidas++;
            if (asistencia.comentario) {
              anotacionesSesiones.push({ fecha: sesion.fecha, comentario: asistencia.comentario });
            }
          }

          const entrega = db.prepare(`
            SELECT entrega, comentario FROM entregas
            WHERE id_sesion = ? AND id_estudiante_asignatura_grupo = ?
          `).get(sesion.id, ea.id_estudiante_asignatura);

          if (entrega) {
            totalEntregas++;
            if (entrega.entrega === 'Si') entregasRealizadas++;
          }
        }

        const examenesDelGrupo = db.prepare(`
          SELECT e.id, e.fecha FROM examenes e WHERE e.id_grupo = ?
        `).all(grupo.id);

        for (const examen of examenesDelGrupo) {
          totalExamenes++;
          const asistenciaExamen = db.prepare(`
            SELECT asistencia, comentario FROM asistencia_examen
            WHERE id_examen = ? AND id_estudiante_asignatura_grupo = ?
          `).get(examen.id, ea.id_estudiante_asignatura);

          if (asistenciaExamen) {
            if (asistenciaExamen.asistencia === 'Si') examenesAsistidos++;
            if (asistenciaExamen.comentario) {
              anotacionesExamenes.push({ fecha: examen.fecha, comentario: asistenciaExamen.comentario });
            }
          }
        }
      }

      estadisticas.push({
        asignatura: ea.asignatura,
        curso: ea.curso,
        convocatorias: ea.convocatorias,
        matriculas: ea.matriculas,
        asistencia: {
          total: totalSesiones,
          asistidas: sesionesAsistidas,
          porcentaje: totalSesiones > 0 ? Math.round((sesionesAsistidas / totalSesiones) * 100) : 0
        },
        examenes: {
          total: totalExamenes,
          asistidos: examenesAsistidos,
          porcentaje: totalExamenes > 0 ? Math.round((examenesAsistidos / totalExamenes) * 100) : 0
        },
        entregas: {
          total: totalEntregas,
          realizadas: entregasRealizadas,
          porcentaje: totalEntregas > 0 ? Math.round((entregasRealizadas / totalEntregas) * 100) : 0
        },
        anotaciones: {
          sesiones: anotacionesSesiones,
          examenes: anotacionesExamenes
        }
      });
    }

    return res.json({
      estudiante: {
        id: estudiante.id,
        nombre: estudiante.nombre,
        dni: estudiante.dni,
        correo: estudiante.correo
      },
      estadisticas
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// POST /api/estudiantes/:id/cambiar-grupo - cambiar estudiante de grupo
router.post('/:id/cambiar-grupo', auth, (req, res) => {
  const { id } = req.params;
  const { id_estudiante_asignatura, id_grupo_nuevo } = req.body;

  if (!id_estudiante_asignatura || !id_grupo_nuevo) {
    return res.status(400).json({ error: 'id_estudiante_asignatura e id_grupo_nuevo son obligatorios' });
  }

  try {
    const estudiante = db.prepare('SELECT * FROM estudiantes WHERE id = ?').get(id);
    if (!estudiante) {
      return res.status(404).json({ error: 'Estudiante no encontrado' });
    }

    const ea = db.prepare('SELECT * FROM estudiantes_asignatura WHERE id = ? AND id_estudiante = ?').get(id_estudiante_asignatura, id);
    if (!ea) {
      return res.status(404).json({ error: 'Asignación no encontrada' });
    }

    const grupo = db.prepare('SELECT * FROM grupos WHERE id = ?').get(id_grupo_nuevo);
    if (!grupo) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }

    if (grupo.id_asignatura !== ea.id_asignatura) {
      return res.status(400).json({ error: 'El grupo no pertenece a la misma asignatura' });
    }

    const existente = db.prepare('SELECT * FROM estudiantes_asignatura_grupo WHERE id_estudiante_asignatura = ? AND id_grupo = ?').get(id_estudiante_asignatura, id_grupo_nuevo);
    if (existente) {
      return res.status(400).json({ error: 'El estudiante ya está en ese grupo' });
    }

    const cambiar = db.transaction(() => {
      const actual = db.prepare('SELECT * FROM estudiantes_asignatura_grupo WHERE id_estudiante_asignatura = ? AND id_grupo = (SELECT id FROM grupos WHERE id = ? AND id_asignatura = ?)').get(id_estudiante_asignatura, grupo.id, ea.id_asignatura);

      if (actual) {
        db.prepare('DELETE FROM estudiantes_asignatura_grupo WHERE id = ?').run(actual.id);
      }

      db.prepare('INSERT INTO estudiantes_asignatura_grupo (id_estudiante_asignatura, id_grupo) VALUES (?, ?)').run(id_estudiante_asignatura, id_grupo_nuevo);
    });

    cambiar();

    const nuevoRegistro = db.prepare(`
      SELECT
        eag.*,
        g.nombre AS nombre_grupo,
        g.tipo AS tipo_grupo
      FROM estudiantes_asignatura_grupo eag
      JOIN grupos g ON g.id = eag.id_grupo
      WHERE eag.id_estudiante_asignatura = ? AND eag.id_grupo = ?
    `).get(id_estudiante_asignatura, id_grupo_nuevo);

    return res.json(nuevoRegistro);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al cambiar de grupo' });
  }
});

// PUT /api/estudiantes/:id/matricula - actualizar el campo matricula (Si/No)
// para una asignatura concreta. Permite anular o reactivar matrícula.
router.put('/:id/matricula', auth, (req, res) => {
  const { id } = req.params;
  const { id_asignatura, matricula } = req.body;

  if (!id_asignatura || (matricula !== 'Si' && matricula !== 'No')) {
    return res.status(400).json({
      error: 'id_asignatura es obligatorio y matricula debe ser "Si" o "No"',
    });
  }

  try {
    const ea = db
      .prepare(
        'SELECT * FROM estudiantes_asignatura WHERE id_estudiante = ? AND id_asignatura = ?'
      )
      .get(id, id_asignatura);
    if (!ea) {
      return res.status(404).json({ error: 'El estudiante no está matriculado en esa asignatura' });
    }

    db.prepare('UPDATE estudiantes_asignatura SET matricula = ? WHERE id = ?').run(matricula, ea.id);

    const actualizado = db
      .prepare('SELECT * FROM estudiantes_asignatura WHERE id = ?')
      .get(ea.id);

    return res.json(actualizado);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al actualizar la matrícula' });
  }
});

// GET /api/estudiantes/:id/grupos - obtener grupos del estudiante
router.get('/:id/grupos', auth, (req, res) => {
  const { id } = req.params;

  try {
    const grupos = db.prepare(`
      SELECT
        g.id,
        g.nombre,
        g.tipo,
        g.aula,
        ca.nombre AS asignatura
      FROM estudiantes_asignatura_grupo eag
      JOIN grupos g ON g.id = eag.id_grupo
      JOIN catalogo_asignaturas ca ON ca.id = g.id_asignatura
      WHERE eag.id_estudiante_asignatura IN (
        SELECT id FROM estudiantes_asignatura WHERE id_estudiante = ?
      )
      ORDER BY ca.nombre, g.tipo, g.nombre
    `).all(id);

    return res.json(grupos);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener grupos del estudiante' });
  }
});

module.exports = router;
