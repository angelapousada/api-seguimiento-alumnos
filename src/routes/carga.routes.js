const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const db = require('../config/db');
const auth = require('../middlewares/auth');

const { aSiNo, parseMatriculados } = require('../utils/cargaExcel');

const router = express.Router();

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.xlsx' || ext === '.xls') return cb(null, true);
    return cb(new Error('Solo se aceptan archivos .xlsx o .xls'));
  },
});

const PERFILES_DIR = path.join(__dirname, '../../uploads/perfiles');
if (!fs.existsSync(PERFILES_DIR)) {
  fs.mkdirSync(PERFILES_DIR, { recursive: true });
}

const IMG_EXTS = ['.jpg', '.jpeg', '.png'];

const uploadPerfiles = multer({
  dest: 'uploads/',
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (IMG_EXTS.includes(ext)) return cb(null, true);
    return cb(null, false);
  },
});

router.post('/asignaturas', auth, upload.single('archivo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Archivo no proporcionado' });
  }

  try {
    const parsed = parseMatriculados(req.file.path);
    fs.unlinkSync(req.file.path);

    if (parsed.estudiantes.length === 0) {
      return res.status(400).json({ error: 'No se encontraron estudiantes en el archivo' });
    }

    const resultado = { creados: 0, actualizados: 0, errores: [] };

    const plan = (parsed.titulacion || '').trim();

    const buscarStmt = db.prepare(
      `SELECT id FROM estudiantes
       WHERE (? IS NOT NULL AND dni = ?)
          OR (? IS NOT NULL AND LOWER(correo) = LOWER(?))
          OR (dni IS NULL AND ? IS NULL AND nombre = ?)`
    );
    const insertarStmt = db.prepare(`
      INSERT INTO estudiantes (dni, nombre, correo, movilidad, necesidades_especiales, plan)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const actualizarStmt = db.prepare(`
      UPDATE estudiantes
      SET nombre = ?, correo = COALESCE(?, correo), movilidad = ?, necesidades_especiales = ?,
          plan = CASE WHEN ? != '' THEN ? ELSE plan END
      WHERE id = ?
    `);

    const insertar = db.transaction(() => {
      parsed.estudiantes.forEach((est, i) => {
        try {
          const dni = est.dni || null;
          const correo = est.correo || null;
          const estudiante = buscarStmt.get(dni, dni, correo, correo, dni, est.nombre || null);
          if (!estudiante) {
            insertarStmt.run(
              dni, est.nombre || '', correo,
              est.movilidad, est.necesidades_especiales, plan
            );
            resultado.creados++;
          } else {
            actualizarStmt.run(
              est.nombre || '', correo,
              est.movilidad, est.necesidades_especiales, plan, plan, estudiante.id
            );
            resultado.actualizados++;
          }
        } catch (err) {
          resultado.errores.push(`Fila ${i + 2}: ${err.message}`);
        }
      });
    });

    insertar();

    return res.json({ mensaje: 'Archivo procesado correctamente', resultado });
  } catch (err) {
    console.error(err);
    if (req.file && req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(500).json({ error: 'Error al procesar el archivo' });
  }
});

router.post('/asignaturas-simple', auth, upload.single('archivo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Archivo no proporcionado' });
  }

  try {
    const parsed = parseMatriculados(req.file.path);
    fs.unlinkSync(req.file.path);

    if (parsed.estudiantes.length === 0) {
      return res.status(400).json({ error: 'No se encontraron estudiantes en el archivo' });
    }
    if (!parsed.nombre) {
      return res.status(400).json({
        error: 'No se encontró el nombre de la asignatura (etiqueta "Asignatura:")',
      });
    }

    return res.json(parsed);
  } catch (err) {
    console.error(err);
    if (req.file && req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(500).json({ error: 'Error al procesar el archivo' });
  }
});

router.post('/imagenes', auth, upload.single('archivo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Archivo no proporcionado' });
  }

  try {
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const datos = xlsx.utils.sheet_to_json(sheet);

    const cols = Object.keys(datos[0]);
    const getCol = (row, names) => {
      for (const n of names) {
        if (cols.includes(n)) return row[n];
      }
      return null;
    };

    let actualizados = 0;
    const actualizar = db.transaction(() => {
      for (const row of datos) {
        const dni = getCol(row, ['DNI', 'dni'])?.toString().trim();
        const rutaImagen = getCol(row, ['Ruta', 'ruta', 'Imagen', 'FOTO']);

        if (dni) {
          const result = db.prepare(`
            UPDATE estudiantes SET ruta_imagen = ? WHERE dni = ?
          `).run(rutaImagen || 'Sin asignar', dni);
          if (result.changes > 0) actualizados++;
        }
      }
    });

    actualizar();
    fs.unlinkSync(req.file.path);

    return res.json({
      mensaje: 'Imágenes actualizadas correctamente',
      actualizados
    });
  } catch (err) {
    console.error(err);
    if (req.file && req.file.path) fs.unlinkSync(req.file.path);
    return res.status(500).json({ error: 'Error al procesar el archivo' });
  }
});

router.post('/imagenes-archivos', auth, uploadPerfiles.array('imagenes', 200), (req, res) => {
  const ficheros = req.files || [];
  if (ficheros.length === 0) {
    return res.status(400).json({ error: 'No se han recibido imágenes válidas (jpg/jpeg/png).' });
  }

  const resultado = {
    actualizados: 0,
    no_coincidentes: [],
    errores: [],
  };

  const stmtBuscar = db.prepare(
    'SELECT id, correo, dni FROM estudiantes WHERE LOWER(correo) = LOWER(?) OR dni = ?'
  );
  const stmtActualizar = db.prepare(
    'UPDATE estudiantes SET ruta_imagen = ? WHERE id = ?'
  );

  for (const f of ficheros) {
    try {
      const ext = path.extname(f.originalname).toLowerCase();
      const baseRaw = path.basename(f.originalname, ext).trim();

      if (!baseRaw) {
        fs.unlinkSync(f.path);
        resultado.no_coincidentes.push(f.originalname);
        continue;
      }

      const estudiante = stmtBuscar.get(baseRaw, baseRaw);
      if (!estudiante) {
        fs.unlinkSync(f.path);
        resultado.no_coincidentes.push(f.originalname);
        continue;
      }

      const safe = baseRaw.replace(/[^a-zA-Z0-9._-]/g, '_');
      const destinoRel = path.join('uploads', 'perfiles', `${safe}${ext}`);
      const destinoAbs = path.join(__dirname, '../../', destinoRel);

      fs.renameSync(f.path, destinoAbs);
      stmtActualizar.run(`/${destinoRel.replace(/\\/g, '/')}`, estudiante.id);
      resultado.actualizados++;
    } catch (err) {
      console.error('[carga/imagenes-archivos]', err);
      resultado.errores.push(`${f.originalname}: ${err.message}`);
      try { fs.unlinkSync(f.path); } catch (_) {}
    }
  }

  return res.json({
    mensaje: 'Imágenes procesadas',
    ...resultado,
  });
});

const nombreGrupoDeHoja = (sheet) => {
  const s = String(sheet).trim();
  let m = s.match(/^PLI\s*(\d+)$/i);
  if (m) return `English ${String(parseInt(m[1])).padStart(2, '0')}`;
  m = s.match(/^PL\s*(\d+)$/i);
  if (m) return String(parseInt(m[1])).padStart(2, '0');
  return null;
};

router.post('/grupos-mtp', auth, upload.single('archivo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Archivo no proporcionado' });
  const idAsignatura = req.body.id_asignatura;
  if (!idAsignatura) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Falta id_asignatura' });
  }
  const idProfesor = req.user.id;

  try {
    const workbook = xlsx.readFile(req.file.path);
    const norm = (v) => String(v == null ? '' : v).trim();
    const resultado = {
      grupos_creados: 0,
      grupos_existentes: 0,
      alumnos_creados: 0,
      alumnos_asignados: 0,
      alumnos_ya_estaban: 0,
      hojas_ignoradas: [],
    };

    const buscarGrupo = db.prepare('SELECT id FROM grupos WHERE id_asignatura = ? AND tipo = ? AND nombre = ?');
    const insertGrupo = db.prepare('INSERT INTO grupos (nombre, tipo, id_asignatura, id_profesor, aula, entregas_activadas) VALUES (?, ?, ?, ?, NULL, ?)');
    const buscarEst = db.prepare('SELECT id FROM estudiantes WHERE dni = ?');
    const insertEst = db.prepare('INSERT INTO estudiantes (dni, nombre, correo, movilidad, necesidades_especiales, plan) VALUES (?, ?, ?, ?, ?, ?)');
    const updatePlanEst = db.prepare('UPDATE estudiantes SET plan = ? WHERE id = ?');
    const buscarEA = db.prepare('SELECT id FROM estudiantes_asignatura WHERE id_estudiante = ? AND id_asignatura = ?');
    const insertEA = db.prepare("INSERT INTO estudiantes_asignatura (id_estudiante, id_asignatura, convocatorias, matriculas, matricula, evaluacion_diferenciada) VALUES (?, ?, ?, ?, 'Si', ?)");
    const buscarEAG = db.prepare('SELECT id FROM estudiantes_asignatura_grupo WHERE id_estudiante_asignatura = ? AND id_grupo = ?');
    const insertEAG = db.prepare('INSERT INTO estudiantes_asignatura_grupo (id_estudiante_asignatura, id_grupo) VALUES (?, ?)');

    const idGrupo = (tipo, nombre) => {
      if (!nombre) return null;
      let g = buscarGrupo.get(idAsignatura, tipo, nombre);
      if (!g) {
        const r = insertGrupo.run(nombre, tipo, idAsignatura, idProfesor,
          tipo === 'Laboratorio' ? 1 : 0);
        g = { id: r.lastInsertRowid };
        resultado.grupos_creados++;
      }
      return g.id;
    };
    const asignar = (eaId, gId) => {
      if (!gId) return;
      if (buscarEAG.get(eaId, gId)) resultado.alumnos_ya_estaban++;
      else { insertEAG.run(eaId, gId); resultado.alumnos_asignados++; }
    };

    const esWorkbookMTP = workbook.SheetNames.some((sn) => /^PLI?\s*\d+$/i.test(String(sn).trim()));

    const procesar = db.transaction(() => {
      db.prepare('UPDATE catalogo_asignaturas SET creada = 1 WHERE id = ?').run(idAsignatura);

      if (esWorkbookMTP) {
        for (const sn of workbook.SheetNames) {
          const nombreGrupo = nombreGrupoDeHoja(sn);
          if (!nombreGrupo) { resultado.hojas_ignoradas.push(sn); continue; }
          const gId = idGrupo('Laboratorio', nombreGrupo);
          const filas = xlsx.utils.sheet_to_json(workbook.Sheets[sn], { header: 1, raw: false, defval: '' });
          const idxCab = filas.findIndex((f) => norm(f[0]).toUpperCase() === 'DNI');
          if (idxCab < 0) continue;
          for (let r = idxCab + 1; r < filas.length; r++) {
            const dni = norm(filas[r][0]);
            if (!dni) continue;
            let est = buscarEst.get(dni);
            if (!est) {
              const ins = insertEst.run(dni, norm(filas[r][1]), null, 'No', 'No', '');
              est = { id: ins.lastInsertRowid };
              resultado.alumnos_creados++;
            }
            let ea = buscarEA.get(est.id, idAsignatura);
            if (!ea) { const ins = insertEA.run(est.id, idAsignatura, 0, 0, 'No'); ea = { id: ins.lastInsertRowid }; }
            asignar(ea.id, gId);
          }
        }
      } else {
        const parsed = parseMatriculados(req.file.path);
        const plan = (parsed.titulacion || '').trim();
        for (const e of parsed.estudiantes) {
          if (!e.dni && !e.nombre) continue;
          let est = e.dni ? buscarEst.get(e.dni) : null;
          if (!est) {
            const ins = insertEst.run(e.dni || null, e.nombre || '', e.correo || null, e.movilidad || 'No', e.necesidades_especiales || 'No', plan);
            est = { id: ins.lastInsertRowid };
            resultado.alumnos_creados++;
          } else if (plan) {
            updatePlanEst.run(plan, est.id);
          }
          let ea = buscarEA.get(est.id, idAsignatura);
          if (!ea) {
            const ins = insertEA.run(est.id, idAsignatura, parseInt(e.convocatorias) || 0, parseInt(e.matriculas) || 0, e.evaluacion_diferenciada || 'No');
            ea = { id: ins.lastInsertRowid };
          }
          asignar(ea.id, idGrupo('Teoría', e.grupo_teoria));
          asignar(ea.id, idGrupo('Laboratorio', e.grupo_laboratorio));
          asignar(ea.id, idGrupo('Aula', e.grupo_aula));
          asignar(ea.id, idGrupo('Tutoría Grupal', e.grupo_tutoria));
        }
      }
    });

    procesar();
    fs.unlinkSync(req.file.path);

    const algoNuevo =
      resultado.grupos_creados > 0 ||
      resultado.alumnos_creados > 0 ||
      resultado.alumnos_asignados > 0;
    const mensaje = algoNuevo
      ? `Grupos importados: ${resultado.grupos_creados} grupos nuevos, ${resultado.alumnos_asignados} asignaciones (${resultado.alumnos_creados} alumnos nuevos).`
      : 'Esta información ya estaba importada.';
    return res.json({ mensaje, ya_importado: !algoNuevo, resultado });
  } catch (err) {
    console.error(err);
    if (req.file && req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(500).json({ error: `Error al procesar el archivo: ${err.message}` });
  }
});

const grupoDeActividad = (actividad) => {
  const s = String(actividad || '');
  let m = s.match(/CEX-(.+?)(?:\s+-\s+|$)/i);
  if (m) return { tipo: 'Teoría', nombre: m[1].trim() };
  m = s.match(/PAS-(.+?)(?:\s+-\s+|$)/i);
  if (m) return { tipo: 'Aula', nombre: `Semin-${m[1].trim()}` };
  return null;
};

const fechaFichajeAISO = (v) => {
  const m = String(v || '').trim().match(/^(\d{2})-(\d{2})-(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

const parseHorario = (v) => {
  const s = String(v || '');
  const t = s.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  const a = s.match(/AULA:\s*([^)]+?)\s*\)/i);
  return {
    hora_inicio: t ? t[1] : null,
    hora_fin: t ? t[2] : null,
    aula: a ? a[1].trim() : null,
  };
};

router.post('/asistentes', auth, upload.single('archivo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Archivo no proporcionado' });
  const idAsignatura = req.body.id_asignatura;
  if (!idAsignatura) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Falta id_asignatura' });
  }

  try {
    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    fs.unlinkSync(req.file.path);

    const norm = (v) => String(v == null ? '' : v).trim();
    const filas = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
    const idxCab = filas.findIndex(
      (f) => f.some((c) => norm(c) === 'Actividad') && f.some((c) => norm(c) === 'Fecha')
    );
    if (idxCab < 0) {
      return res.status(400).json({ error: 'No se encontró la cabecera (Usuario/Actividad/Fecha)' });
    }
    const cab = filas[idxCab];
    const cU = cab.findIndex((c) => norm(c) === 'Usuario');
    const cA = cab.findIndex((c) => norm(c) === 'Actividad');
    const cH = cab.findIndex((c) => norm(c) === 'Horario');
    const cF = cab.findIndex((c) => norm(c) === 'Fecha');

    const resultado = {
      fichajes: filas.length - idxCab - 1,
      sesiones_creadas: 0,
      asistencias: 0,
      ignorados_actividad_generica: 0,
      alumno_no_encontrado: 0,
      grupo_no_encontrado: 0,
      alumno_no_en_grupo: 0,
    };

    const buscarEst = db.prepare('SELECT id FROM estudiantes WHERE LOWER(correo) = LOWER(?)');
    const buscarGrupo = db.prepare(
      'SELECT id, id_profesor FROM grupos WHERE id_asignatura = ? AND tipo = ? AND nombre = ?'
    );
    const buscarSesion = db.prepare(
      `SELECT id FROM sesiones WHERE id_grupo = ? AND fecha = ? AND COALESCE(hora_inicio, '') = ? LIMIT 1`
    );
    const insertSesion = db.prepare(
      `INSERT INTO sesiones (fecha, hora_inicio, hora_fin, aula, id_grupo, id_profesor)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const buscarEAG = db.prepare(`
      SELECT eag.id FROM estudiantes_asignatura_grupo eag
      JOIN estudiantes_asignatura ea ON ea.id = eag.id_estudiante_asignatura
      WHERE ea.id_estudiante = ? AND ea.id_asignatura = ? AND eag.id_grupo = ?
    `);
    const marcarAsistencia = db.prepare(`
      INSERT INTO asistencia_sesion (asistencia, id_sesion, id_estudiante_asignatura_grupo)
      VALUES ('Si', ?, ?)
      ON CONFLICT(id_sesion, id_estudiante_asignatura_grupo)
      DO UPDATE SET asistencia = 'Si'
    `);

    const procesar = db.transaction(() => {
      for (let r = idxCab + 1; r < filas.length; r++) {
        const fila = filas[r];
        const usuario = norm(fila[cU]);
        if (!usuario) continue;

        const grupoAct = grupoDeActividad(fila[cA]);
        if (!grupoAct) {
          resultado.ignorados_actividad_generica++;
          continue;
        }
        const fecha = fechaFichajeAISO(fila[cF]);
        if (!fecha) continue;

        const grupo = buscarGrupo.get(idAsignatura, grupoAct.tipo, grupoAct.nombre);
        if (!grupo) {
          resultado.grupo_no_encontrado++;
          continue;
        }
        const { hora_inicio, hora_fin, aula } = parseHorario(fila[cH]);
        let sesion = buscarSesion.get(grupo.id, fecha, hora_inicio || '');
        if (!sesion) {
          const ins = insertSesion.run(
            fecha,
            hora_inicio,
            hora_fin,
            aula,
            grupo.id,
            grupo.id_profesor
          );
          sesion = { id: ins.lastInsertRowid };
          resultado.sesiones_creadas++;
        }

        const est = buscarEst.get(`${usuario}@uniovi.es`);
        if (!est) {
          resultado.alumno_no_encontrado++;
          continue;
        }
        const eag = buscarEAG.get(est.id, idAsignatura, grupo.id);
        if (!eag) {
          resultado.alumno_no_en_grupo++;
          continue;
        }
        marcarAsistencia.run(sesion.id, eag.id);
        resultado.asistencias++;
      }
    });

    procesar();
    return res.json({ mensaje: 'Asistencia de fichajes importada', resultado });
  } catch (err) {
    console.error(err);
    if (req.file && req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(500).json({ error: `Error al procesar el archivo: ${err.message}` });
  }
});

// Importa asistencia y entregas de laboratorio desde el libro MTP-Grupos.
// Cada hoja (PLn/PLIn) es un grupo de laboratorio con dos tablas que comparten
// las columnas de sesión (0, 1_2, ..., 27_28): arriba asistencia (1=asistió) y
// más abajo entregas (1=entregada). Solo se importan los grupos que ya tienen
// sesiones creadas; si el Excel tiene más columnas de sesión que sesiones en la
// app, se avisa y no se importa ese grupo; si la app tiene más, se rellenan las
// más antiguas.
router.post('/asistencia-laboratorio', auth, upload.single('archivo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Archivo no proporcionado' });
  const idAsignatura = req.body.id_asignatura;
  if (!idAsignatura) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Falta id_asignatura' });
  }

  const norm = (v) => (v == null ? '' : String(v).trim());
  const esColSesion = (h) => /^\d+(_\d+)?$/.test(norm(h));

  try {
    const workbook = xlsx.readFile(req.file.path);
    fs.unlinkSync(req.file.path);

    const resultado = {
      grupos_procesados: [],
      sin_grupo: [],
      sin_sesiones: [],
      descuadre: [],
      asistencias_marcadas: 0,
      entregas_marcadas: 0,
    };

    const upsertAsistencia = db.prepare(`
      INSERT INTO asistencia_sesion (id_sesion, id_estudiante_asignatura_grupo, asistencia)
      VALUES (?, ?, ?)
      ON CONFLICT(id_sesion, id_estudiante_asignatura_grupo)
      DO UPDATE SET asistencia = excluded.asistencia
    `);
    const upsertEntrega = db.prepare(`
      INSERT INTO entregas (id_sesion, id_estudiante_asignatura_grupo, entrega, valoracion)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id_sesion, id_estudiante_asignatura_grupo)
      DO UPDATE SET entrega = excluded.entrega, valoracion = excluded.valoracion
    `);

    const procesar = db.transaction(() => {
      for (const sn of workbook.SheetNames) {
        const nombreGrupo = nombreGrupoDeHoja(sn);
        if (!nombreGrupo) { resultado.sin_grupo.push(sn); continue; }

        const grupo = db.prepare(
          "SELECT id FROM grupos WHERE id_asignatura = ? AND tipo = 'Laboratorio' AND nombre = ?"
        ).get(idAsignatura, nombreGrupo);
        if (!grupo) { resultado.sin_grupo.push(`${sn} (${nombreGrupo})`); continue; }

        const sesiones = db.prepare(
          "SELECT id FROM sesiones WHERE id_grupo = ? ORDER BY fecha ASC, COALESCE(hora_inicio,'') ASC"
        ).all(grupo.id);
        if (sesiones.length === 0) { resultado.sin_sesiones.push(nombreGrupo); continue; }

        // Mapa DNI -> id_estudiante_asignatura_grupo de los alumnos del grupo.
        const alumnos = db.prepare(`
          SELECT e.dni AS dni, eag.id AS eag
          FROM estudiantes_asignatura_grupo eag
          JOIN estudiantes_asignatura ea ON ea.id = eag.id_estudiante_asignatura
          JOIN estudiantes e ON e.id = ea.id_estudiante
          WHERE eag.id_grupo = ?
        `).all(grupo.id);
        const eagPorDni = new Map(alumnos.map((a) => [norm(a.dni), a.eag]));

        const filas = xlsx.utils.sheet_to_json(workbook.Sheets[sn], { header: 1, raw: false, defval: '' });

        // Cabecera de asistencia: primera fila con «DNI» en la columna 0.
        const idxCabAsis = filas.findIndex((f) => norm(f[0]).toUpperCase() === 'DNI');
        if (idxCabAsis < 0) { resultado.sin_grupo.push(`${sn} (sin cabecera)`); continue; }

        const cabecera = filas[idxCabAsis];
        const colsSesion = [];
        for (let c = 0; c < cabecera.length; c++) {
          if (esColSesion(cabecera[c])) colsSesion.push(c);
        }

        if (colsSesion.length > sesiones.length) {
          resultado.descuadre.push({
            grupo: nombreGrupo,
            columnas_excel: colsSesion.length,
            sesiones_app: sesiones.length,
          });
          continue; // no se importa este grupo
        }

        // Se rellenan las sesiones más antiguas (columna i -> sesión i).
        const sesionDeCol = (i) => sesiones[i].id;

        let asisGrupo = 0;
        let entGrupo = 0;

        // --- Asistencia ---
        const idxEntrega = filas.findIndex(
          (f) => norm(f[0]).toLowerCase().startsWith('entrega tareas')
        );
        const finAsis = idxEntrega > idxCabAsis ? idxEntrega : filas.length;
        for (let r = idxCabAsis + 1; r < finAsis; r++) {
          const dni = norm(filas[r][0]);
          if (!dni) continue;
          const eag = eagPorDni.get(dni);
          if (!eag) continue;
          for (let i = 0; i < colsSesion.length; i++) {
            const val = norm(filas[r][colsSesion[i]]);
            const asistio = val === '1' ? 'Si' : 'No';
            upsertAsistencia.run(sesionDeCol(i), eag, asistio);
            if (asistio === 'Si') asisGrupo++;
          }
        }

        // --- Entregas ---
        if (idxEntrega >= 0) {
          const idxCabEnt = filas.findIndex(
            (f, i) => i > idxEntrega && norm(f[0]).toUpperCase() === 'DNI'
          );
          if (idxCabEnt >= 0) {
            for (let r = idxCabEnt + 1; r < filas.length; r++) {
              const dni = norm(filas[r][0]);
              if (!dni) continue;
              const eag = eagPorDni.get(dni);
              if (!eag) continue;
              for (let i = 0; i < colsSesion.length; i++) {
                const val = norm(filas[r][colsSesion[i]]);
                if (val === '1') {
                  // Entregada; Se califica con puntuación máxima (verde).
                  upsertEntrega.run(sesionDeCol(i), eag, 'Si', 3);
                  entGrupo++;
                } else {
                  upsertEntrega.run(sesionDeCol(i), eag, 'No', 0);
                }
              }
            }
          }
        }

        resultado.asistencias_marcadas += asisGrupo;
        resultado.entregas_marcadas += entGrupo;
        resultado.grupos_procesados.push({
          grupo: nombreGrupo,
          columnas_excel: colsSesion.length,
          sesiones_app: sesiones.length,
          asistencias: asisGrupo,
          entregas: entGrupo,
        });
      }
    });

    procesar();
    return res.json(resultado);
  } catch (err) {
    console.error(err);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(500).json({ error: `Error al importar laboratorio: ${err.message}` });
  }
});

module.exports = router;
