const db = require('../config/db');

const listar = async (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM estudiantes ORDER BY nombre').all();
    res.json(rows);
  } catch (error) {
    console.error('Error listar estudiantes:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const obtener = async (req, res) => {
  try {
    const { id } = req.params;
    const rows = db.prepare('SELECT * FROM estudiantes WHERE id = ?').all(id);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Estudiante no encontrado' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error obtener estudiante:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const buscar = async (req, res) => {
  try {
    const { q } = req.query;
    const rows = db.prepare(
      `SELECT * FROM estudiantes WHERE nombre LIKE ? OR dni LIKE ? OR correo LIKE ? LIMIT 20`
    ).all(`%${q}%`, `%${q}%`, `%${q}%`);
    res.json(rows);
  } catch (error) {
    console.error('Error buscar estudiante:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const cargarExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se ha proporcionado ningún archivo' });
    }

    const xlsx = require('xlsx');
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    if (data.length === 0) {
      return res.status(400).json({ error: 'El archivo está vacío' });
    }

    let asignaturaId;
    const primeraFila = data[0];

    if (primeraFila.Asignatura) {
      const result = db.prepare(
        `INSERT INTO asignaturas (nombre, curso, titulacion) VALUES (?, ?, ?)`
      ).run(primeraFila.Asignatura || 'Sin nombre', primeraFila['Curso Académico'] || '', primeraFila.Titulación || '');
      asignaturaId = result.lastInsertRowid;
    } else {
      return res.status(400).json({ error: 'El formato del Excel no es válido' });
    }

    const grupoTeoria = primeraFila['Grupo de Teoría'];
    const grupoPracticas = primeraFila['Grupo de Prácticas de Aula'];
    const grupoLaboratorio = primeraFila['Grupo de Prácticas de Laboratorio'];

    const grupos = [];
    if (grupoTeoria) {
      const g = db.prepare('INSERT INTO grupos (nombre, tipo, id_asignatura) VALUES (?, ?, ?)').run(grupoTeoria, 'Teoría', asignaturaId);
      grupos.push({ nombre: grupoTeoria, tipo: 'Teoría', id: g.lastInsertRowid });
    }
    if (grupoPracticas) {
      const g = db.prepare('INSERT INTO grupos (nombre, tipo, id_asignatura) VALUES (?, ?, ?)').run(grupoPracticas, 'Prácticas', asignaturaId);
      grupos.push({ nombre: grupoPracticas, tipo: 'Prácticas', id: g.lastInsertRowid });
    }
    if (grupoLaboratorio) {
      const g = db.prepare('INSERT INTO grupos (nombre, tipo, id_asignatura) VALUES (?, ?, ?)').run(grupoLaboratorio, 'Laboratorio', asignaturaId);
      grupos.push({ nombre: grupoLaboratorio, tipo: 'Laboratorio', id: g.lastInsertRowid });
    }

    for (const fila of data) {
      if (!fila.DNI) continue;

      let estudianteExistente = db.prepare('SELECT id FROM estudiantes WHERE dni = ?').all(fila.DNI);

      let estudianteId;
      if (estudianteExistente.length === 0) {
        const estudianteResult = db.prepare(
          'INSERT INTO estudiantes (dni, nombre, correo, movilidad) VALUES (?, ?, ?, ?)'
        ).run(fila.DNI, fila['Nombre completo'], fila.Correo, fila.Movilidad || 'No');
        estudianteId = estudianteResult.lastInsertRowid;
      } else {
        estudianteId = estudianteExistente[0].id;
      }

      try {
        db.prepare(
          'INSERT INTO estudiantes_asignatura (id_estudiante, id_asignatura, convocatorias, matriculas, matricula) VALUES (?, ?, ?, ?, ?)'
        ).run(estudianteId, asignaturaId, fila.Convocatorias || 0, fila.Matrículas || 0, fila['Evaluación diferenciada'] || 'No');
      } catch (e) {
        // Ignore duplicate
      }

      const relacionEA = db.prepare('SELECT id FROM estudiantes_asignatura WHERE id_estudiante = ? AND id_asignatura = ?').all(estudianteId, asignaturaId);
      if (relacionEA.length === 0) continue;
      const idEA = relacionEA[0].id;

      for (const grupo of grupos) {
        let grupoCampo;
        if (grupo.tipo === 'Teoría') grupoCampo = fila['Grupo de Teoría'];
        else if (grupo.tipo === 'Prácticas') grupoCampo = fila['Grupo de Prácticas de Aula'];
        else if (grupo.tipo === 'Laboratorio') grupoCampo = fila['Grupo de Prácticas de Laboratorio'];

        if (grupoCampo === grupo.nombre) {
          try {
            db.prepare('INSERT INTO estudiantes_asignatura_grupo (id_estudiante_asignatura, id_grupo) VALUES (?, ?)').run(idEA, grupo.id);
          } catch (e) {
            // Ignore duplicate
          }
        }
      }
    }

    res.json({ message: 'Excel cargado correctamente', asignaturaId, estudiantes: data.length });
  } catch (error) {
    console.error('Error cargar Excel:', error);
    res.status(500).json({ error: 'Error al procesar el archivo' });
  }
};

const cargarImagenes = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No se han proporcionado imágenes' });
    }

    const fs = require('fs');
    const path = require('path');
    const uploadDir = path.join(__dirname, '../../uploads/imagenes');
    
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    let cargadas = 0;
    for (const file of req.files) {
      const nombreArchivo = path.parse(file.originalname).name;
      const extension = path.extname(file.originalname);

      const estudiantes = db.prepare('SELECT id FROM estudiantes WHERE correo LIKE ?').all(`%${nombreArchivo}%`);

      if (estudiantes.length > 0) {
        const filename = `estudiante_${estudiantes[0].id}${extension}`;
        const filepath = path.join(uploadDir, filename);
        fs.writeFileSync(filepath, file.buffer);

        db.prepare('UPDATE estudiantes SET ruta_imagen = ? WHERE id = ?').run(filename, estudiantes[0].id);
        cargadas++;
      }
    }

    res.json({ message: `${cargadas} imágenes cargadas correctamente` });
  } catch (error) {
    console.error('Error cargar imágenes:', error);
    res.status(500).json({ error: 'Error al procesar las imágenes' });
  }
};

const obtenerEstadisticas = async (req, res) => {
  try {
    const { id_grupo } = req.params;
    const rows = db.prepare(
      `SELECT 
        e.id, e.nombre, e.dni,
        (SELECT COUNT(*) FROM asistencia_sesion a 
         JOIN sesiones s ON a.id_sesion = s.id 
         WHERE a.id_estudiante_asignatura_grupo = hag.id AND a.asistencia = 'Si') as total_asistencias,
        (SELECT COUNT(*) FROM sesiones s WHERE s.id_grupo = ?) as total_sesiones,
        (SELECT COUNT(*) FROM deliveries ent 
         WHERE ent.id_estudiante_asignatura_grupo = hag.id AND ent.entrega = 'Si') as total_entregas
       FROM estudiantes_asignatura_grupo hag
       JOIN estudiantes_asignatura ea ON hag.id_estudiante_asignatura = ea.id
       JOIN estudiantes e ON ea.id_estudiante = e.id
       WHERE hag.id_grupo = ?
       ORDER BY e.nombre`
    ).all(id_grupo, id_grupo);
    res.json(rows);
  } catch (error) {
    console.error('Error obtener estadísticas:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

module.exports = {
  listar,
  obtener,
  buscar,
  cargarExcel,
  cargarImagenes,
  obtenerEstadisticas
};
