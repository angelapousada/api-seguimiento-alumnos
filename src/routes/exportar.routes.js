const express = require('express');
const XLSX = require('xlsx');
const db = require('../config/db');
const auth = require('../middlewares/auth');

const router = express.Router();

/**
 * GET /api/asignaturas/:id/exportar?id_grupo=<opcional>
 *
 * Exporta el seguimiento de los estudiantes de una asignatura (o de un
 * grupo concreto) a un libro Excel con las hojas:
 *   - Resumen: una fila por estudiante y grupo con totales y porcentajes.
 *   - Asistencia: una fila por estudiante y sesión.
 *   - Entregas: una fila por entrega registrada.
 *   - Valoraciones: una fila por concepto valorado.
 *   - Examenes: una fila por estudiante y examen.
 */
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

    const filasResumen = [];
    const filasAsistencia = [];
    const filasEntregas = [];
    const filasValoraciones = [];
    const filasExamenes = [];

    const stmtEstudiantes = db.prepare(`
      SELECT
        eag.id AS id_eag,
        e.nombre,
        e.dni,
        e.correo,
        ea.matricula,
        ea.convocatorias,
        ea.matriculas
      FROM estudiantes_asignatura_grupo eag
      JOIN estudiantes_asignatura ea ON ea.id = eag.id_estudiante_asignatura
      JOIN estudiantes e ON e.id = ea.id_estudiante
      WHERE eag.id_grupo = ?
      ORDER BY e.nombre
    `);

    const stmtSesiones = db.prepare(
      'SELECT * FROM sesiones WHERE id_grupo = ? ORDER BY fecha, hora_inicio'
    );
    const stmtExamenes = db.prepare(
      'SELECT * FROM examenes WHERE id_grupo = ? ORDER BY fecha, hora_inicio'
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
    const stmtAsistenciaExamen = db.prepare(
      'SELECT * FROM asistencia_examen WHERE id_examen = ? AND id_estudiante_asignatura_grupo = ?'
    );

    for (const grupo of grupos) {
      const estudiantes = stmtEstudiantes.all(grupo.id);
      const sesiones = stmtSesiones.all(grupo.id);
      const examenes = stmtExamenes.all(grupo.id);

      for (const est of estudiantes) {
        let sesionesAsistidas = 0;
        let totalEntregas = 0;
        let entregasRealizadas = 0;
        let sumaValoraciones = 0;
        let numValoraciones = 0;
        let examenesAsistidos = 0;

        for (const sesion of sesiones) {
          const asistencia = stmtAsistencia.get(sesion.id, est.id_eag);
          if (asistencia && asistencia.asistencia === 'Si') sesionesAsistidas++;

          filasAsistencia.push({
            'Grupo': grupo.nombre,
            'Tipo': grupo.tipo,
            'Estudiante': est.nombre,
            'DNI': est.dni,
            'Fecha': sesion.fecha,
            'Hora': sesion.hora_inicio || '',
            'Asistencia': asistencia ? asistencia.asistencia : 'No',
            'Comentario': (asistencia && asistencia.comentario) || '',
          });

          const entrega = stmtEntrega.get(sesion.id, est.id_eag);
          if (entrega) {
            totalEntregas++;
            if (entrega.entrega === 'Si') entregasRealizadas++;
            filasEntregas.push({
              'Grupo': grupo.nombre,
              'Tipo': grupo.tipo,
              'Estudiante': est.nombre,
              'DNI': est.dni,
              'Fecha sesión': sesion.fecha,
              'Entrega': entrega.entrega,
              'Valoración': entrega.valoracion ?? '',
              'Comentario': entrega.comentario || '',
            });
          }

          for (const concepto of stmtConceptos.all(sesion.id)) {
            const valoracion = stmtValoracion.get(concepto.id, est.id_eag);
            if (valoracion) {
              if (valoracion.valoracion != null) {
                sumaValoraciones += valoracion.valoracion;
                numValoraciones++;
              }
              filasValoraciones.push({
                'Grupo': grupo.nombre,
                'Tipo': grupo.tipo,
                'Estudiante': est.nombre,
                'DNI': est.dni,
                'Fecha sesión': sesion.fecha,
                'Concepto': concepto.descripcion,
                'Valoración': valoracion.valoracion ?? '',
                'Comentario': valoracion.comentario || '',
              });
            }
          }
        }

        for (const examen of examenes) {
          const asistenciaExamen = stmtAsistenciaExamen.get(examen.id, est.id_eag);
          if (asistenciaExamen && asistenciaExamen.asistencia === 'Si') {
            examenesAsistidos++;
          }
          filasExamenes.push({
            'Grupo': grupo.nombre,
            'Tipo': grupo.tipo,
            'Estudiante': est.nombre,
            'DNI': est.dni,
            'Examen': examen.nombre,
            'Fecha': examen.fecha,
            'Asistencia': asistenciaExamen ? asistenciaExamen.asistencia : 'No',
            'Comentario': (asistenciaExamen && asistenciaExamen.comentario) || '',
          });
        }

        const totalSesiones = sesiones.length;
        filasResumen.push({
          'Grupo': grupo.nombre,
          'Tipo': grupo.tipo,
          'Estudiante': est.nombre,
          'DNI': est.dni,
          'Correo': est.correo || '',
          'Matrícula': est.matricula,
          'Sesiones asistidas': sesionesAsistidas,
          'Total sesiones': totalSesiones,
          '% Asistencia': totalSesiones > 0
            ? Math.round((sesionesAsistidas / totalSesiones) * 100)
            : 0,
          'Entregas realizadas': entregasRealizadas,
          'Total entregas': totalEntregas,
          '% Entregas': totalEntregas > 0
            ? Math.round((entregasRealizadas / totalEntregas) * 100)
            : 0,
          'Exámenes asistidos': examenesAsistidos,
          'Total exámenes': examenes.length,
          'Valoración media': numValoraciones > 0
            ? Math.round((sumaValoraciones / numValoraciones) * 100) / 100
            : '',
        });
      }
    }

    const workbook = XLSX.utils.book_new();
    const agregarHoja = (nombre, filas, columnas) => {
      const hoja = filas.length > 0
        ? XLSX.utils.json_to_sheet(filas)
        : XLSX.utils.aoa_to_sheet([columnas]);
      // Anchura de columnas legible.
      const cabeceras = filas.length > 0 ? Object.keys(filas[0]) : columnas;
      hoja['!cols'] = cabeceras.map((c) => ({
        wch: Math.max(c.length + 2, 12),
      }));
      XLSX.utils.book_append_sheet(workbook, hoja, nombre);
    };

    agregarHoja('Resumen', filasResumen, [
      'Grupo', 'Tipo', 'Estudiante', 'DNI', 'Correo', 'Matrícula',
      'Sesiones asistidas', 'Total sesiones', '% Asistencia',
      'Entregas realizadas', 'Total entregas', '% Entregas',
      'Exámenes asistidos', 'Total exámenes', 'Valoración media',
    ]);
    agregarHoja('Asistencia', filasAsistencia, [
      'Grupo', 'Tipo', 'Estudiante', 'DNI', 'Fecha', 'Hora', 'Asistencia', 'Comentario',
    ]);
    agregarHoja('Entregas', filasEntregas, [
      'Grupo', 'Tipo', 'Estudiante', 'DNI', 'Fecha sesión', 'Entrega', 'Valoración', 'Comentario',
    ]);
    agregarHoja('Valoraciones', filasValoraciones, [
      'Grupo', 'Tipo', 'Estudiante', 'DNI', 'Fecha sesión', 'Concepto', 'Valoración', 'Comentario',
    ]);
    agregarHoja('Examenes', filasExamenes, [
      'Grupo', 'Tipo', 'Estudiante', 'DNI', 'Examen', 'Fecha', 'Asistencia', 'Comentario',
    ]);

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const limpiar = (texto) =>
      String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '_');
    const sufijo = id_grupo ? `_${limpiar(grupos[0].nombre)}` : '';
    const nombreFichero = `seguimiento_${limpiar(asignatura.codigo)}${sufijo}.xlsx`;

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
