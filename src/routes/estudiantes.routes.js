const express = require('express');
const db = require('../config/db');
const auth = require('../middlewares/auth');

const router = express.Router();

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
          e.id, e.dni, e.nombre, e.correo, e.movilidad, e.necesidades_especiales, e.ruta_imagen, e.plan,
          ea.id AS id_estudiante_asignatura,
          ea.matricula, ea.convocatorias, ea.matriculas, ea.evaluacion_diferenciada
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
        ea.evaluacion_diferenciada,
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

router.post('/', auth, (req, res) => {
  const {
    dni,
    nombre,
    correo,
    movilidad,
    necesidades_especiales,
    evaluacion_diferenciada,
    id_grupo,
    convocatorias,
    matriculas,
    matricula,
  } = req.body;

  if (!nombre) {
    return res.status(400).json({ error: 'nombre es obligatorio' });
  }

  try {
    const crear = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO estudiantes (dni, nombre, correo, movilidad, necesidades_especiales)
        VALUES (?, ?, ?, ?, ?)
      `).run(dni || null, nombre, correo || null, movilidad || 'No', necesidades_especiales || 'No');

      const idEstudiante = result.lastInsertRowid;

      if (id_grupo) {
        const grupo = db.prepare('SELECT id, id_asignatura FROM grupos WHERE id = ?').get(id_grupo);
        if (!grupo) {
          throw Object.assign(new Error('Grupo no encontrado'), { status: 404 });
        }

        const convocatoriasInt = Number.isInteger(parseInt(convocatorias, 10))
          ? parseInt(convocatorias, 10)
          : 0;
        const matriculasInt = Number.isInteger(parseInt(matriculas, 10))
          ? parseInt(matriculas, 10)
          : 0;
        const matriculaStr = matricula === 'No' ? 'No' : 'Si';

        const ea = db.prepare(`
          INSERT INTO estudiantes_asignatura (id_estudiante, id_asignatura, matricula, convocatorias, matriculas, evaluacion_diferenciada)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          idEstudiante,
          grupo.id_asignatura,
          matriculaStr,
          convocatoriasInt,
          matriculasInt,
          evaluacion_diferenciada === 'Si' ? 'Si' : 'No',
        );

        db.prepare(`
          INSERT INTO estudiantes_asignatura_grupo (id_estudiante_asignatura, id_grupo)
          VALUES (?, ?)
        `).run(ea.lastInsertRowid, id_grupo);
      }

      return idEstudiante;
    });

    const idEstudiante = crear();
    const nuevo = db.prepare('SELECT * FROM estudiantes WHERE id = ?').get(idEstudiante);
    return res.status(201).json(nuevo);
  } catch (err) {
    console.error(err);
    if (err.status === 404) {
      return res.status(404).json({ error: err.message });
    }
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'El DNI o correo ya existe' });
    }
    return res.status(500).json({ error: 'Error al crear estudiante' });
  }
});

router.put('/:id', auth, (req, res) => {
  const { id } = req.params;
  const { nombre, correo, movilidad, necesidades_especiales, ruta_imagen } = req.body;

  try {
    const estudiante = db.prepare('SELECT * FROM estudiantes WHERE id = ?').get(id);
    if (!estudiante) {
      return res.status(404).json({ error: 'Estudiante no encontrado' });
    }

    db.prepare(`
      UPDATE estudiantes
      SET nombre = ?, correo = ?, movilidad = ?, necesidades_especiales = ?, ruta_imagen = ?
      WHERE id = ?
    `).run(
      nombre !== undefined ? nombre : estudiante.nombre,
      correo !== undefined ? correo : estudiante.correo,
      movilidad !== undefined ? movilidad : estudiante.movilidad,
      necesidades_especiales !== undefined ? necesidades_especiales : estudiante.necesidades_especiales,
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

    // Acumuladores por tipo de grupo
    const porTipoMap = new Map();
    const ensureTipo = (tipo) => {
      if (!porTipoMap.has(tipo)) {
        porTipoMap.set(tipo, {
          tipo, asisTotal: 0, asisSi: 0,
          entTotal: 0, entSi: 0, notaSum: 0, entregasActivadas: 0,
        });
      }
      return porTipoMap.get(tipo);
    };

    for (const ea of asignaturas) {
      const grupos = db.prepare(`
        SELECT eag.id AS id_eag, g.id, g.nombre, g.tipo, g.entregas_activadas
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
      let sumaNotasEntrega = 0; // nota por entrega: 0=mal/no entregada, 0.5=regular, 1=bien

      for (const grupo of grupos) {
        const acc = ensureTipo(grupo.tipo);
        if (grupo.entregas_activadas) acc.entregasActivadas = 1;
        const sesionesDelGrupo = db.prepare(`
          SELECT s.id, s.fecha
          FROM sesiones s
          WHERE s.id_grupo = ?
        `).all(grupo.id);

        for (const sesion of sesionesDelGrupo) {
          totalSesiones++;
          acc.asisTotal++;
          const asistencia = db.prepare(`
            SELECT asistencia, comentario FROM asistencia_sesion
            WHERE id_sesion = ? AND id_estudiante_asignatura_grupo = ?
          `).get(sesion.id, grupo.id_eag);

          if (asistencia) {
            if (asistencia.asistencia === 'Si') { sesionesAsistidas++; acc.asisSi++; }
            if (asistencia.comentario) {
              anotacionesSesiones.push({ fecha: sesion.fecha, comentario: asistencia.comentario });
            }
          }

          const entrega = db.prepare(`
            SELECT entrega, valoracion, comentario FROM entregas
            WHERE id_sesion = ? AND id_estudiante_asignatura_grupo = ?
          `).get(sesion.id, grupo.id_eag);

          if (entrega) {
            totalEntregas++;
            acc.entTotal++;
            if (entrega.entrega === 'Si') {
              entregasRealizadas++;
              acc.entSi++;
              if (entrega.valoracion === 3) { sumaNotasEntrega += 1; acc.notaSum += 1; }
              else if (entrega.valoracion === 2) { sumaNotasEntrega += 0.5; acc.notaSum += 0.5; }
            }
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
          `).get(examen.id, grupo.id_eag);

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
          porcentaje: totalEntregas > 0 ? Math.round((entregasRealizadas / totalEntregas) * 100) : 0,
          // Nota media de entregas sobre 10 (0=mal/no entregada, 5=regular, 10=bien).
          nota: totalEntregas > 0 ? Math.round((sumaNotasEntrega / totalEntregas) * 100) / 10 : 0
        },
        anotaciones: {
          sesiones: anotacionesSesiones,
          examenes: anotacionesExamenes
        }
      });
    }

    const ordenTipos = ['Teoría', 'Laboratorio', 'Aula', 'Tutoría Grupal'];
    const porTipo = [...porTipoMap.values()]
      .sort((a, b) => ordenTipos.indexOf(a.tipo) - ordenTipos.indexOf(b.tipo))
      .map((t) => ({
        tipo: t.tipo,
        asistencia: {
          total: t.asisTotal,
          asistidas: t.asisSi,
          porcentaje: t.asisTotal > 0 ? Math.round((t.asisSi / t.asisTotal) * 100) : 0,
        },
        entregas: {
          activadas: t.entregasActivadas ? 1 : 0,
          total: t.entTotal,
          realizadas: t.entSi,
          porcentaje: t.entTotal > 0 ? Math.round((t.entSi / t.entTotal) * 100) : 0,
          nota: t.entTotal > 0 ? Math.round((t.notaSum / t.entTotal) * 100) / 10 : 0,
        },
      }));

    return res.json({
      estudiante: {
        id: estudiante.id,
        nombre: estudiante.nombre,
        dni: estudiante.dni,
        correo: estudiante.correo
      },
      estadisticas,
      porTipo
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

router.get('/:id/heatmap', auth, (req, res) => {
  const { id } = req.params;
  const { id_asignatura } = req.query;

  try {
    const estudiante = db.prepare('SELECT id FROM estudiantes WHERE id = ?').get(id);
    if (!estudiante) {
      return res.status(404).json({ error: 'Estudiante no encontrado' });
    }

    const filtroAsig = id_asignatura ? ' AND ea.id_asignatura = ?' : '';
    const params = id_asignatura ? [id, id_asignatura] : [id];

    // Asistencias: una fila por sesión, indicando si se asistió o no
    const paramsAsis = id_asignatura
      ? [id, id_asignatura, id, id_asignatura]
      : [id, id];
    const asistencias = db.prepare(`
      SELECT tipo, fecha, hora, hecha AS hechas
      FROM (
        SELECT g.tipo AS tipo, s.fecha AS fecha, s.hora_inicio AS hora, s.id AS id_sesion,
               MAX(CASE WHEN a.asistencia = 'Si' THEN 1 ELSE 0 END) AS hecha
        FROM estudiantes_asignatura ea
        JOIN estudiantes_asignatura_grupo eag ON eag.id_estudiante_asignatura = ea.id
        JOIN grupos g ON g.id = eag.id_grupo
        JOIN sesiones s ON s.id_grupo = eag.id_grupo
        LEFT JOIN asistencia_sesion a
          ON a.id_sesion = s.id AND a.id_estudiante_asignatura_grupo = eag.id
        WHERE ea.id_estudiante = ?${filtroAsig}
        GROUP BY s.id

        UNION

        SELECT g.tipo AS tipo, s.fecha AS fecha, s.hora_inicio AS hora, s.id AS id_sesion,
               CASE WHEN a.asistencia = 'Si' THEN 1 ELSE 0 END AS hecha
        FROM estudiantes_asignatura ea
        JOIN estudiantes_asignatura_grupo eag ON eag.id_estudiante_asignatura = ea.id
        JOIN asistencia_sesion a ON a.id_estudiante_asignatura_grupo = eag.id
        JOIN sesiones s ON s.id = a.id_sesion
        JOIN grupos g ON g.id = s.id_grupo
        WHERE ea.id_estudiante = ?${filtroAsig}
      )
      ORDER BY tipo, fecha, hora
    `).all(...paramsAsis);

    // Entregas: también una fila por sesión, con el nivel del semáforo.
    const entregas = db.prepare(`
      SELECT g.tipo AS tipo, s.fecha AS fecha, s.hora_inicio AS hora,
             SUM(CASE WHEN en.entrega = 'Si' THEN 1 ELSE 0 END) AS hechas,
             CASE
               WHEN SUM(CASE WHEN en.entrega = 'Si' AND en.valoracion BETWEEN 1 AND 3 THEN 1 ELSE 0 END) > 0
                 THEN ROUND(AVG(CASE WHEN en.entrega = 'Si' AND en.valoracion BETWEEN 1 AND 3 THEN en.valoracion END))
               WHEN SUM(CASE WHEN en.entrega = 'No' THEN 1 ELSE 0 END) > 0
                 THEN 0
               ELSE NULL
             END AS nivel
      FROM entregas en
      JOIN sesiones s ON s.id = en.id_sesion
      JOIN estudiantes_asignatura_grupo eag ON eag.id = en.id_estudiante_asignatura_grupo
      JOIN grupos g ON g.id = eag.id_grupo
      JOIN estudiantes_asignatura ea ON ea.id = eag.id_estudiante_asignatura
      WHERE ea.id_estudiante = ?${filtroAsig}
      GROUP BY s.id
      ORDER BY g.tipo, s.fecha, s.hora_inicio
    `).all(...params);

    // Se agrupa por tipo de grupo, respetando un orden fijo.
    const ordenTipos = ['Teoría', 'Laboratorio', 'Aula', 'Tutoría Grupal'];
    const mapa = new Map();
    const asegurar = (tipo) => {
      if (!mapa.has(tipo)) mapa.set(tipo, { tipo, asistencias: [], entregas: [] });
      return mapa.get(tipo);
    };
    for (const r of asistencias) {
      asegurar(r.tipo).asistencias.push({ fecha: r.fecha, hora: r.hora, total: 1, hechas: r.hechas });
    }
    for (const r of entregas) {
      asegurar(r.tipo).entregas.push({ fecha: r.fecha, hora: r.hora, total: 1, hechas: r.hechas, nivel: r.nivel });
    }
    const porTipo = [...mapa.values()].sort(
      (a, b) => ordenTipos.indexOf(a.tipo) - ordenTipos.indexOf(b.tipo)
    );

    return res.json({ porTipo });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener el mapa de calor' });
  }
});

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
      const existente = db.prepare(`
        SELECT eag.id
        FROM estudiantes_asignatura_grupo eag
        JOIN grupos g ON g.id = eag.id_grupo
        WHERE eag.id_estudiante_asignatura = ?
          AND g.id_asignatura = ?
          AND g.tipo = ?
      `).get(id_estudiante_asignatura, ea.id_asignatura, grupo.tipo);

      if (existente) {
        db.prepare(
          'UPDATE estudiantes_asignatura_grupo SET id_grupo = ? WHERE id = ?'
        ).run(id_grupo_nuevo, existente.id);
      } else {
        db.prepare(
          'INSERT INTO estudiantes_asignatura_grupo (id_estudiante_asignatura, id_grupo) VALUES (?, ?)'
        ).run(id_estudiante_asignatura, id_grupo_nuevo);
      }
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
