const express = require('express');
const XLSX = require('xlsx');
const db = require('../config/db');
const auth = require('../middlewares/auth');

const router = express.Router();

const PREFIJO_GRUPO = {
  'Teoría': (n) => `Clases Expositivas-${n}`,
  'Aula': (n) => `Prácticas de Aula/${n}`,
  'Laboratorio': (n) => `Prácticas de Laboratorio-${n}`,
  'Tutoría Grupal': (n) => `Tutorías Grupales-${n}`,
};

router.get('/:id/exportar', auth, (req, res) => {
  const { id } = req.params;
  const { id_grupo } = req.query;

  try {
    const asignatura = db
      .prepare('SELECT * FROM catalogo_asignaturas WHERE id = ?')
      .get(id);
    if (!asignatura) {
      return res.status(404).json({ error: 'Asignatura no encontrada' });
    }

    let grupos;
    if (id_grupo) {
      grupos = db
        .prepare('SELECT * FROM grupos WHERE id = ? AND id_asignatura = ?')
        .all(id_grupo, id);
      if (grupos.length === 0) {
        return res.status(404).json({ error: 'Grupo no encontrado en la asignatura' });
      }
    } else {
      grupos = db
        .prepare('SELECT * FROM grupos WHERE id_asignatura = ? ORDER BY tipo, nombre')
        .all(id);
    }

    const TIPOS_HOJA = [
      { tipo: 'Teoría', hoja: 'Teoría' },
      { tipo: 'Aula', hoja: 'Prácticas de Aula' },
      { tipo: 'Laboratorio', hoja: 'Prácticas de Laboratorio' },
      { tipo: 'Tutoría Grupal', hoja: 'Tutorías Grupales' },
    ];
    const filasPorTipo = {};
    for (const { tipo } of TIPOS_HOJA) filasPorTipo[tipo] = [];

    const stmtEstudiantes = db.prepare(`
      SELECT
        eag.id AS id_eag,
        e.nombre,
        e.dni
      FROM estudiantes_asignatura_grupo eag
      JOIN estudiantes_asignatura ea ON ea.id = eag.id_estudiante_asignatura
      JOIN estudiantes e ON e.id = ea.id_estudiante
      WHERE eag.id_grupo = ?
      ORDER BY e.nombre
    `);

    const stmtSesiones = db.prepare(
      'SELECT * FROM sesiones WHERE id_grupo = ? ORDER BY fecha, hora_inicio'
    );
    const stmtAsistencia = db.prepare(
      'SELECT * FROM asistencia_sesion WHERE id_sesion = ? AND id_estudiante_asignatura_grupo = ?'
    );
    const stmtEntrega = db.prepare(
      'SELECT * FROM entregas WHERE id_sesion = ? AND id_estudiante_asignatura_grupo = ?'
    );
    const stmtConceptos = db.prepare(
      'SELECT * FROM conceptos WHERE id_sesion = ? ORDER BY id'
    );
    const stmtValoracion = db.prepare(
      'SELECT * FROM valoraciones WHERE id_concepto = ? AND id_estudiante_asignatura_grupo = ?'
    );

    const conceptosPorTipo = {};
    const vistosPorTipo = {};
    for (const { tipo } of TIPOS_HOJA) {
      conceptosPorTipo[tipo] = [];
      vistosPorTipo[tipo] = new Set();
    }
    const registrarConcepto = (tipo, descripcion) => {
      if (!vistosPorTipo[tipo].has(descripcion)) {
        vistosPorTipo[tipo].add(descripcion);
        conceptosPorTipo[tipo].push(descripcion);
      }
    };
    const colNota = (d) => `${d} (nota)`;
    const colComentario = (d) => `${d} (comentario)`;

    for (const grupo of grupos) {
      const estudiantes = stmtEstudiantes.all(grupo.id);
      const sesiones = stmtSesiones.all(grupo.id);
      const destino = filasPorTipo[grupo.tipo] || (filasPorTipo[grupo.tipo] = []);

      const conceptosDeSesion = {};
      for (const sesion of sesiones) {
        const cs = stmtConceptos.all(sesion.id);
        conceptosDeSesion[sesion.id] = cs;
        for (const c of cs) registrarConcepto(grupo.tipo, c.descripcion);
      }

      for (const est of estudiantes) {
        for (const sesion of sesiones) {
          const asistencia = stmtAsistencia.get(sesion.id, est.id_eag);
          const entrega = stmtEntrega.get(sesion.id, est.id_eag);

          const fila = {
            'Estudiante': est.nombre,
            'DNI': est.dni,
            'Grupo': grupo.nombre,
            'Asistencia': asistencia ? asistencia.asistencia : 'No',
            'Entrega': entrega ? entrega.entrega : '',
            'Comentario entrega': entrega ? (entrega.comentario || '') : '',
          };

          for (const concepto of conceptosDeSesion[sesion.id]) {
            const valoracion = stmtValoracion.get(concepto.id, est.id_eag);
            if (!valoracion) continue;
            fila[colNota(concepto.descripcion)] =
              valoracion.valoracion != null ? valoracion.valoracion : '';
            fila[colComentario(concepto.descripcion)] = valoracion.comentario || '';
          }

          fila['Fecha'] = sesion.fecha;
          fila['Hora'] = sesion.hora_inicio || '';
          destino.push(fila);
        }
      }
    }

    const workbook = XLSX.utils.book_new();

    const titulacion = db
      .prepare('SELECT nombre FROM titulaciones WHERE id = ?')
      .get(asignatura.id_titulacion);
    const alumnos = id_grupo
      ? db.prepare(`
          SELECT DISTINCT ea.id AS id_ea, e.dni, e.nombre, e.correo, e.movilidad,
                 e.plan, ea.convocatorias, ea.matriculas, ea.evaluacion_diferenciada
          FROM estudiantes_asignatura_grupo eag
          JOIN estudiantes_asignatura ea ON ea.id = eag.id_estudiante_asignatura
          JOIN estudiantes e ON e.id = ea.id_estudiante
          WHERE eag.id_grupo = ? ORDER BY e.nombre
        `).all(id_grupo)
      : db.prepare(`
          SELECT ea.id AS id_ea, e.dni, e.nombre, e.correo, e.movilidad,
                 e.plan, ea.convocatorias, ea.matriculas, ea.evaluacion_diferenciada
          FROM estudiantes_asignatura ea
          JOIN estudiantes e ON e.id = ea.id_estudiante
          WHERE ea.id_asignatura = ? ORDER BY e.nombre
        `).all(id);
    const stmtGruposAlumno = db.prepare(`
      SELECT g.tipo, g.nombre FROM estudiantes_asignatura_grupo eag
      JOIN grupos g ON g.id = eag.id_grupo
      WHERE eag.id_estudiante_asignatura = ?
    `);
    const nombreGrado = titulacion ? titulacion.nombre : '';

    // Estadísticas de seguimiento por alumno (asistencia y entregas).
    const stmtEagsAlumno = db.prepare(`
      SELECT eag.id AS id_eag, g.id AS id_grupo, g.entregas_activadas
      FROM estudiantes_asignatura_grupo eag
      JOIN grupos g ON g.id = eag.id_grupo
      WHERE eag.id_estudiante_asignatura = ?
    `);
    const stmtNumSesiones = db.prepare('SELECT COUNT(*) AS n FROM sesiones WHERE id_grupo = ?');
    const stmtNumAsistencias = db.prepare(
      "SELECT COUNT(*) AS n FROM asistencia_sesion WHERE id_estudiante_asignatura_grupo = ? AND asistencia = 'Si'"
    );
    const stmtNumEntregas = db.prepare(
      "SELECT COUNT(*) AS n FROM entregas WHERE id_estudiante_asignatura_grupo = ? AND entrega = 'Si'"
    );
    const seguimientoAlumno = (idEa) => {
      let sesiones = 0, asistencias = 0, entregas = 0, sesionesConEntrega = 0;
      for (const eag of stmtEagsAlumno.all(idEa)) {
        if (id_grupo && String(eag.id_grupo) !== String(id_grupo)) continue;
        const nSes = stmtNumSesiones.get(eag.id_grupo).n;
        sesiones += nSes;
        asistencias += stmtNumAsistencias.get(eag.id_eag).n;
        entregas += stmtNumEntregas.get(eag.id_eag).n;
        if (eag.entregas_activadas) sesionesConEntrega += nSes;
      }
      const pct = sesiones ? Math.round((asistencias / sesiones) * 100) : 0;
      return {
        asistencias: `${asistencias}/${sesiones}`,
        pctAsistencia: `${pct}%`,
        entregas: sesionesConEntrega ? `${entregas}/${sesionesConEntrega}` : '',
      };
    };

    // Cabecera con los datos de la asignatura (formato del listado de SIES),
    // de modo que el fichero exportado identifica la asignatura y puede volver
    // a importarse.
    const filasResumen = [
      ['Plan:', nombreGrado],
      ['Asignatura:', asignatura.nombre],
      ['Código:', asignatura.codigo],
      [],
      ['DNI', 'Alumno', 'Email', 'Grado', 'Convocatorias', 'Matrículas',
        'Evalución Diferenciada', 'Movilidad Erasmus', 'Clases Expositivas',
        'Prácticas de Aula/Semina', 'Prácticas de Laboratorio', 'Tutorías Grupales',
        'Asistencias', '% Asistencia', 'Entregas'],
    ];
    const soloGrupo = id_grupo ? grupos[0] : null;
    alumnos.forEach((a) => {
      const g = { 'Teoría': '', 'Aula': '', 'Laboratorio': '', 'Tutoría Grupal': '' };
      if (soloGrupo) {
        g[soloGrupo.tipo] = soloGrupo.nombre;
      } else {
        for (const row of stmtGruposAlumno.all(a.id_ea)) {
          if (row.tipo in g) g[row.tipo] = row.nombre;
        }
      }
      const etiqueta = (tipo) =>
        g[tipo] ? PREFIJO_GRUPO[tipo](g[tipo]) : '';
      const seg = seguimientoAlumno(a.id_ea);
      filasResumen.push([
        a.dni || '', a.nombre || '', a.correo || '', a.plan || nombreGrado,
        a.convocatorias ?? '', a.matriculas ?? '',
        a.evaluacion_diferenciada || 'No', a.movilidad || 'No',
        etiqueta('Teoría'), etiqueta('Aula'),
        etiqueta('Laboratorio'), etiqueta('Tutoría Grupal'),
        seg.asistencias, seg.pctAsistencia, seg.entregas,
      ]);
    });
    const hojaResumen = XLSX.utils.aoa_to_sheet(filasResumen);
    XLSX.utils.book_append_sheet(workbook, hojaResumen, 'Resumen');

    const agregarHoja = (nombre, filas, columnas) => {
      const hoja = filas.length > 0
        ? XLSX.utils.json_to_sheet(filas, { header: columnas })
        : XLSX.utils.aoa_to_sheet([columnas]);
      hoja['!cols'] = columnas.map((c) => ({
        wch: Math.max(String(c).length + 2, 12),
      }));
      XLSX.utils.book_append_sheet(workbook, hoja, nombre);
    };

    const COLUMNAS_BASE = [
      'Estudiante', 'DNI', 'Grupo', 'Asistencia', 'Entrega', 'Comentario entrega',
    ];
    for (const { tipo, hoja } of TIPOS_HOJA) {
      if (id_grupo && !grupos.some((g) => g.tipo === tipo)) continue;
      const colsConceptos = [];
      for (const d of conceptosPorTipo[tipo]) {
        colsConceptos.push(colNota(d), colComentario(d));
      }
      const columnas = [...COLUMNAS_BASE, ...colsConceptos, 'Fecha', 'Hora'];
      agregarHoja(hoja, filasPorTipo[tipo], columnas);
    }

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const limpiar = (texto) =>
      String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '_');
    const NOMBRE_TIPO = {
      'Teoría': 'teoria',
      'Aula': 'practicas-aula',
      'Laboratorio': 'practicas-laboratorio',
      'Tutoría Grupal': 'tutorias-grupales',
    };
    let nombreFichero;
    if (id_grupo) {
      const g = grupos[0];
      const base = NOMBRE_TIPO[g.tipo] || limpiar(g.tipo);
      nombreFichero = `${base}-${limpiar(g.nombre)}.xlsx`;
    } else {
      nombreFichero = `seguimiento_${limpiar(asignatura.codigo)}.xlsx`;
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${nombreFichero}"`);
    return res.send(buffer);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al exportar el seguimiento' });
  }
});

module.exports = router;
