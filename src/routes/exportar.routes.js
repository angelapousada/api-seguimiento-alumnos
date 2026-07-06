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
      'SELECT * FROM conceptos WHERE id_sesion = ?'
    );
    const stmtValoracion = db.prepare(
      'SELECT * FROM valoraciones WHERE id_concepto = ? AND id_estudiante_asignatura_grupo = ?'
    );

    for (const grupo of grupos) {
      const estudiantes = stmtEstudiantes.all(grupo.id);
      const sesiones = stmtSesiones.all(grupo.id);
      const destino = filasPorTipo[grupo.tipo] || (filasPorTipo[grupo.tipo] = []);

      for (const est of estudiantes) {
        for (const sesion of sesiones) {
          const asistencia = stmtAsistencia.get(sesion.id, est.id_eag);
          const entrega = stmtEntrega.get(sesion.id, est.id_eag);

          const conceptosTxt = [];
          const comentariosTxt = [];
          for (const concepto of stmtConceptos.all(sesion.id)) {
            const valoracion = stmtValoracion.get(concepto.id, est.id_eag);
            if (!valoracion) continue;
            conceptosTxt.push(
              valoracion.valoracion != null
                ? `${concepto.descripcion}: ${valoracion.valoracion}`
                : concepto.descripcion
            );
            if (valoracion.comentario) {
              comentariosTxt.push(`${concepto.descripcion}: ${valoracion.comentario}`);
            }
          }

          destino.push({
            'Estudiante': est.nombre,
            'DNI': est.dni,
            'Grupo': grupo.nombre,
            'Asistencia': asistencia ? asistencia.asistencia : 'No',
            'Entrega': entrega ? entrega.entrega : '',
            'Comentario entrega': entrega ? (entrega.comentario || '') : '',
            'Conceptos a evaluar': conceptosTxt.join('; '),
            'Comentario conceptos': comentariosTxt.join('; '),
            'Fecha': sesion.fecha,
            'Hora': sesion.hora_inicio || '',
          });
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
    const filasResumen = [
      ['DNI', 'Alumno', 'Email', 'Grado', 'Convocatorias', 'Matrículas',
        'Evalución Diferenciada', 'Movilidad Erasmus', 'Clases Expositivas',
        'Prácticas de Aula/Semina', 'Prácticas de Laboratorio', 'Tutorías Grupales'],
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
      filasResumen.push([
        a.dni || '', a.nombre || '', a.correo || '', a.plan || nombreGrado,
        a.convocatorias ?? '', a.matriculas ?? '',
        a.evaluacion_diferenciada || 'No', a.movilidad || 'No',
        etiqueta('Teoría'), etiqueta('Aula'),
        etiqueta('Laboratorio'), etiqueta('Tutoría Grupal'),
      ]);
    });
    const hojaResumen = XLSX.utils.aoa_to_sheet(filasResumen);
    XLSX.utils.book_append_sheet(workbook, hojaResumen, 'Resumen');

    const agregarHoja = (nombre, filas, columnas) => {
      const hoja = filas.length > 0
        ? XLSX.utils.json_to_sheet(filas)
        : XLSX.utils.aoa_to_sheet([columnas]);
      const cabeceras = filas.length > 0 ? Object.keys(filas[0]) : columnas;
      hoja['!cols'] = cabeceras.map((c) => ({
        wch: Math.max(c.length + 2, 12),
      }));
      XLSX.utils.book_append_sheet(workbook, hoja, nombre);
    };

    const COLUMNAS_TIPO = [
      'Estudiante', 'DNI', 'Grupo', 'Asistencia', 'Entrega', 'Comentario entrega',
      'Conceptos a evaluar', 'Comentario conceptos', 'Fecha', 'Hora',
    ];
    for (const { tipo, hoja } of TIPOS_HOJA) {
      if (id_grupo && !grupos.some((g) => g.tipo === tipo)) continue;
      agregarHoja(hoja, filasPorTipo[tipo], COLUMNAS_TIPO);
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
