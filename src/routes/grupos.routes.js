const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const db = require('../config/db');
const auth = require('../middlewares/auth');

const router = express.Router();

const uploadXlsx = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.xlsx' || ext === '.xls') return cb(null, true);
    return cb(new Error('Solo se aceptan archivos .xlsx o .xls'));
  },
});

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

router.get('/:id/estudiantes', auth, (req, res) => {
  const { id } = req.params;

  try {
    const estudiantes = db.prepare(`
      SELECT
        eag.id,
        ea.id AS id_estudiante_asignatura,
        e.id AS id_estudiante,
        e.nombre,
        e.dni,
        e.correo,
        e.movilidad,
        e.necesidades_especiales,
        e.ruta_imagen,
        ea.convocatorias,
        ea.matriculas,
        ea.matricula,
        ea.evaluacion_diferenciada
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

router.get('/:id/horarios', auth, (req, res) => {
  try {
    const horarios = db.prepare('SELECT * FROM horarios WHERE id_grupo = ? ORDER BY dia, hora_inicio').all(req.params.id);
    return res.json(horarios);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener horarios' });
  }
});

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

const COL_GRUPO_POR_TIPO = {
  'Teoría': ['Grupo de Teoría', 'Grupo de Teoria', 'GRUPO DE TEORÍA', 'GRUPO DE TEORIA'],
  'Laboratorio': ['Grupo de Prácticas de Laboratorio', 'Grupo de Practicas de Laboratorio', 'GRUPO DE PRÁCTICAS DE LABORATORIO', 'GRUPO DE PRACTICAS DE LABORATORIO'],
};

router.post('/:id/cargar-alumnos', auth, uploadXlsx.single('archivo'), (req, res) => {
  const { id } = req.params;
  if (!req.file) return res.status(400).json({ error: 'Archivo no proporcionado' });

  try {
    const grupo = db.prepare('SELECT * FROM grupos WHERE id = ?').get(id);
    if (!grupo) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }

    const nombresColumna = COL_GRUPO_POR_TIPO[grupo.tipo];
    if (!nombresColumna) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: `Tipo de grupo no soportado para importación: ${grupo.tipo}` });
    }

    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const datos = xlsx.utils.sheet_to_json(sheet, { defval: null });
    fs.unlinkSync(req.file.path);

    if (datos.length === 0) {
      return res.status(400).json({ error: 'El archivo está vacío' });
    }

    const cols = Object.keys(datos[0]);
    const findCol = (names) => names.find((n) => cols.includes(n)) || null;
    const colDni = findCol(['DNI', 'dni', 'NIF']);
    const colNombre = findCol(['Nombre completo', 'Nombre', 'nombre', 'NOMBRE']);
    const colCorreo = findCol(['Correo', 'correo', 'EMAIL', 'email']);
    const colMovilidad = findCol(['Movilidad', 'movilidad']);
    const colConvocatorias = findCol(['Convocatorias', 'convocatorias']);
    const colMatriculas = findCol(['Matrículas', 'Matriculas', 'matriculas']);
    const colEvalDif = findCol(['Evaluación diferenciada', 'Evaluacion diferenciada', 'evaluacion_diferenciada']);
    const colNee = findCol(['Necesidades educativas especiales', 'Necesidades especiales', 'necesidades_especiales', 'NEE']);
    const colGrupo = findCol(nombresColumna);

    if (!colGrupo) {
      return res.status(400).json({
        error: `No se encontró la columna de grupo (${nombresColumna[0]}) en el Excel`,
      });
    }

    const norm = (v) => (v == null ? '' : String(v).trim());

    const filasGrupo = datos.filter((row) => norm(row[colGrupo]) === norm(grupo.nombre));

    const resultado = {
      total_excel: datos.length,
      coincidentes: filasGrupo.length,
      creados: 0,
      ya_existian: 0,
      movidos_de_otro_grupo: 0,
      errores: [],
    };

    const findEstudianteStmt = db.prepare(
      'SELECT id FROM estudiantes WHERE dni = ? OR (dni IS NULL AND LOWER(correo) = LOWER(?))'
    );
    const insertEstudianteStmt = db.prepare(
      'INSERT INTO estudiantes (dni, nombre, correo, movilidad, necesidades_especiales) VALUES (?, ?, ?, ?, ?)'
    );
    const findEAStmt = db.prepare(
      'SELECT id FROM estudiantes_asignatura WHERE id_estudiante = ? AND id_asignatura = ?'
    );
    const insertEAStmt = db.prepare(`
      INSERT INTO estudiantes_asignatura
        (id_estudiante, id_asignatura, convocatorias, matriculas, matricula, evaluacion_diferenciada)
      VALUES (?, ?, ?, ?, 'Si', ?)
    `);
    const updateEAStmt = db.prepare(`
      UPDATE estudiantes_asignatura
      SET convocatorias = ?, matriculas = ?, evaluacion_diferenciada = ?
      WHERE id = ?
    `);
    const findEAGSameTypeStmt = db.prepare(`
      SELECT eag.id FROM estudiantes_asignatura_grupo eag
      JOIN grupos g ON g.id = eag.id_grupo
      WHERE eag.id_estudiante_asignatura = ? AND g.id_asignatura = ? AND g.tipo = ?
    `);
    const updateEAGStmt = db.prepare('UPDATE estudiantes_asignatura_grupo SET id_grupo = ? WHERE id = ?');
    const insertEAGStmt = db.prepare(
      'INSERT INTO estudiantes_asignatura_grupo (id_estudiante_asignatura, id_grupo) VALUES (?, ?)'
    );

    const procesar = db.transaction(() => {
      for (let i = 0; i < filasGrupo.length; i++) {
        const row = filasGrupo[i];
        const dni = colDni ? norm(row[colDni]) || null : null;
        const nombre = colNombre ? norm(row[colNombre]) : '';
        const correo = colCorreo ? norm(row[colCorreo]) || null : null;
        const movilidad = colMovilidad && norm(row[colMovilidad]).toLowerCase().startsWith('s') ? 'Si' : 'No';
        const convocatorias = colConvocatorias ? parseInt(row[colConvocatorias]) || 0 : 0;
        const matriculas = colMatriculas ? parseInt(row[colMatriculas]) || 0 : 0;
        const evalDif = colEvalDif && norm(row[colEvalDif]).toLowerCase().startsWith('s') ? 'Si' : 'No';
        const nee = colNee && norm(row[colNee]).toLowerCase().startsWith('s') ? 'Si' : 'No';

        if (!dni && !correo && !nombre) {
          resultado.errores.push(`Fila ${i + 2}: vacía`);
          continue;
        }

        let estudiante = findEstudianteStmt.get(dni, correo);
        if (!estudiante) {
          const r = insertEstudianteStmt.run(dni, nombre, correo, movilidad, nee);
          estudiante = { id: r.lastInsertRowid };
          resultado.creados++;
        } else {
          resultado.ya_existian++;
        }

        let ea = findEAStmt.get(estudiante.id, grupo.id_asignatura);
        if (!ea) {
          const r = insertEAStmt.run(estudiante.id, grupo.id_asignatura, convocatorias, matriculas, evalDif);
          ea = { id: r.lastInsertRowid };
        } else {
          updateEAStmt.run(convocatorias, matriculas, evalDif, ea.id);
        }

        const eagMismoTipo = findEAGSameTypeStmt.get(ea.id, grupo.id_asignatura, grupo.tipo);
        if (eagMismoTipo) {
          if (eagMismoTipo.id !== undefined) {
            const eagActual = db.prepare('SELECT id_grupo FROM estudiantes_asignatura_grupo WHERE id = ?').get(eagMismoTipo.id);
            if (eagActual && eagActual.id_grupo != grupo.id) {
              updateEAGStmt.run(grupo.id, eagMismoTipo.id);
              resultado.movidos_de_otro_grupo++;
            }
          }
        } else {
          insertEAGStmt.run(ea.id, grupo.id);
        }
      }
    });

    procesar();
    return res.json(resultado);
  } catch (err) {
    console.error(err);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(500).json({ error: `Error al procesar el archivo: ${err.message}` });
  }
});

const DIA_A_NUM = {
  'Lunes': 1, 'Martes': 2, 'Miércoles': 3, 'Miercoles': 3,
  'Jueves': 4, 'Viernes': 5, 'Sábado': 6, 'Sabado': 6, 'Domingo': 0,
};

router.post('/:id/generar-sesiones', auth, (req, res) => {
  const { id } = req.params;
  const { fecha_desde, fecha_hasta } = req.body;

  if (!fecha_desde || !fecha_hasta) {
    return res.status(400).json({ error: 'fecha_desde y fecha_hasta son obligatorias' });
  }

  try {
    const grupo = db.prepare('SELECT * FROM grupos WHERE id = ?').get(id);
    if (!grupo) return res.status(404).json({ error: 'Grupo no encontrado' });

    const horarios = db.prepare('SELECT * FROM horarios WHERE id_grupo = ?').all(id);
    if (horarios.length === 0) {
      return res.status(400).json({ error: 'El grupo no tiene horarios configurados' });
    }

    const desde = new Date(fecha_desde + 'T00:00:00');
    const hasta = new Date(fecha_hasta + 'T00:00:00');
    if (isNaN(desde.getTime()) || isNaN(hasta.getTime()) || desde > hasta) {
      return res.status(400).json({ error: 'Rango de fechas inválido' });
    }

    const existeSesionStmt = db.prepare(
      'SELECT id FROM sesiones WHERE id_grupo = ? AND fecha = ? AND COALESCE(hora_inicio, "") = COALESCE(?, "")'
    );
    const insertSesionStmt = db.prepare(`
      INSERT INTO sesiones (fecha, hora_inicio, hora_fin, aula, id_grupo, id_profesor)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const resultado = { creadas: 0, omitidas_por_existir: 0 };

    const generar = db.transaction(() => {
      for (const h of horarios) {
        const diaNum = DIA_A_NUM[h.dia];
        if (diaNum === undefined) continue;

        const cursor = new Date(desde);
        while (cursor.getDay() !== diaNum) {
          cursor.setDate(cursor.getDate() + 1);
          if (cursor > hasta) break;
        }

        while (cursor <= hasta) {
          const fechaStr = fmt(cursor);
          const ya = existeSesionStmt.get(id, fechaStr, h.hora_inicio);
          if (ya) {
            resultado.omitidas_por_existir++;
          } else {
            insertSesionStmt.run(fechaStr, h.hora_inicio, h.hora_fin, grupo.aula, id, grupo.id_profesor);
            resultado.creadas++;
          }
          cursor.setDate(cursor.getDate() + 7);
        }
      }
    });

    generar();
    return res.json(resultado);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: `Error al generar sesiones: ${err.message}` });
  }
});

module.exports = router;
