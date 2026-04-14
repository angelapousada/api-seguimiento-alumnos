const pool = require('../config/db');

const listar = async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM estudiantes ORDER BY nombre');
    res.json(rows);
  } catch (error) {
    console.error('Error listar estudiantes:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const obtener = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM estudiantes WHERE id = $1', [id]);

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
    const { rows } = await pool.query(
      `SELECT * FROM estudiantes WHERE nombre LIKE $1 OR dni LIKE $1 OR correo LIKE $1 LIMIT 20`,
      [`%${q}%`]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error buscar estudiante:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const cargarExcel = async (req, res) => {
  const client = await pool.connect();
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

    await client.query('BEGIN');

    let asignaturaId;
    const primeraFila = data[0];

    if (primeraFila.Asignatura) {
      const result = await client.query(
        `INSERT INTO asignaturas (nombre, curso, titulacion) VALUES ($1, $2, $3) RETURNING id`,
        [primeraFila.Asignatura || 'Sin nombre', primeraFila['Curso Académico'] || '', primeraFila.Titulación || '']
      );
      asignaturaId = result.rows[0].id;
    } else {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'El formato del Excel no es válido' });
    }

    const grupoTeoria = primeraFila['Grupo de Teoría'];
    const grupoPracticas = primeraFila['Grupo de Prácticas de Aula'];
    const grupoLaboratorio = primeraFila['Grupo de Prácticas de Laboratorio'];

    const grupos = [];
    if (grupoTeoria) {
      const g = await client.query(
        'INSERT INTO grupos (nombre, tipo, id_asignatura) VALUES ($1, $2, $3) RETURNING id',
        [grupoTeoria, 'Teoría', asignaturaId]
      );
      grupos.push({ nombre: grupoTeoria, tipo: 'Teoría', id: g.rows[0].id });
    }
    if (grupoPracticas) {
      const g = await client.query(
        'INSERT INTO grupos (nombre, tipo, id_asignatura) VALUES ($1, $2, $3) RETURNING id',
        [grupoPracticas, 'Prácticas', asignaturaId]
      );
      grupos.push({ nombre: grupoPracticas, tipo: 'Prácticas', id: g.rows[0].id });
    }
    if (grupoLaboratorio) {
      const g = await client.query(
        'INSERT INTO grupos (nombre, tipo, id_asignatura) VALUES ($1, $2, $3) RETURNING id',
        [grupoLaboratorio, 'Laboratorio', asignaturaId]
      );
      grupos.push({ nombre: grupoLaboratorio, tipo: 'Laboratorio', id: g.rows[0].id });
    }

    for (const fila of data) {
      if (!fila.DNI) continue;

      let { rows: estudianteExistente } = await client.query(
        'SELECT id FROM estudiantes WHERE dni = $1',
        [fila.DNI]
      );

      let estudianteId;
      if (estudianteExistente.length === 0) {
        const estudianteResult = await client.query(
          'INSERT INTO estudiantes (dni, nombre, correo, movilidad) VALUES ($1, $2, $3, $4) RETURNING id',
          [fila.DNI, fila['Nombre completo'], fila.Correo, fila.Movilidad || 'No']
        );
        estudianteId = estudianteResult.rows[0].id;
      } else {
        estudianteId = estudianteExistente[0].id;
      }

      try {
        await client.query(
          'INSERT INTO estudiantes_asignatura (id_estudiante, id_asignatura, convocatorias, matriculas, matricula) VALUES ($1, $2, $3, $4, $5)',
          [estudianteId, asignaturaId, fila.Convocatorias || 0, fila.Matrículas || 0, fila['Evaluación diferenciada'] || 'No']
        );
      } catch (e) {
        // Ignore duplicate
      }

      let { rows: relacionEA } = await client.query(
        'SELECT id FROM estudiantes_asignatura WHERE id_estudiante = $1 AND id_asignatura = $2',
        [estudianteId, asignaturaId]
      );
      if (relacionEA.length === 0) continue;
      const idEA = relacionEA[0].id;

      for (const grupo of grupos) {
        let grupoCampo;
        if (grupo.tipo === 'Teoría') grupoCampo = fila['Grupo de Teoría'];
        else if (grupo.tipo === 'Prácticas') grupoCampo = fila['Grupo de Prácticas de Aula'];
        else if (grupo.tipo === 'Laboratorio') grupoCampo = fila['Grupo de Prácticas de Laboratorio'];

        if (grupoCampo === grupo.nombre) {
          try {
            await client.query(
              'INSERT INTO estudiantes_asignatura_grupo (id_estudiante_asignatura, id_grupo) VALUES ($1, $2)',
              [idEA, grupo.id]
            );
          } catch (e) {
            // Ignore duplicate
          }
        }
      }
    }

    await client.query('COMMIT');

    res.json({ message: 'Excel cargado correctamente', asignaturaId, estudiantes: data.length });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error cargar Excel:', error);
    res.status(500).json({ error: 'Error al procesar el archivo' });
  } finally {
    client.release();
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

      const { rows: estudiantes } = await pool.query(
        'SELECT id FROM estudiantes WHERE correo LIKE $1',
        [`%${nombreArchivo}%`]
      );

      if (estudiantes.length > 0) {
        const filename = `estudiante_${estudiantes[0].id}${extension}`;
        const filepath = path.join(uploadDir, filename);
        fs.writeFileSync(filepath, file.buffer);

        await pool.query(
          'UPDATE estudiantes SET ruta_imagen = $1 WHERE id = $2',
          [filename, estudiantes[0].id]
        );
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
    const { rows } = await pool.query(
      `SELECT 
        e.id, e.nombre, e.dni,
        (SELECT COUNT(*) FROM asistencia_sesion a 
         JOIN sesiones s ON a.id_sesion = s.id 
         WHERE a.id_estudiante_asignatura_grupo = hag.id AND a.asistencia = 'Si') as total_asistencias,
        (SELECT COUNT(*) FROM sesiones s WHERE s.id_grupo = $1) as total_sesiones,
        (SELECT COUNT(*) FROM entregas ent 
         WHERE ent.id_estudiante_asignatura_grupo = hag.id AND ent.entrega = 'Si') as total_entregas
       FROM estudiantes_asignatura_grupo hag
       JOIN estudiantes_asignatura ea ON hag.id_estudiante_asignatura = ea.id
       JOIN estudiantes e ON ea.id_estudiante = e.id
       WHERE hag.id_grupo = $1
       ORDER BY e.nombre`,
      [id_grupo]
    );
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
