const pool = require('../config/db');

const listar = async (req, res) => {
  try {
    const { id_grupo, id_asignatura } = req.query;
    let query = `SELECT e.*, g.nombre as nombre_grupo FROM examenes e JOIN grupos g ON e.id_grupo = g.id`;
    const params = [];
    const conditions = [];

    if (id_grupo) {
      conditions.push('e.id_grupo = $' + (params.length + 1));
      params.push(id_grupo);
    }
    if (id_asignatura) {
      conditions.push('g.id_asignatura = $' + (params.length + 1));
      params.push(id_asignatura);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY e.fecha DESC';
    const { rows } = params.length > 0 
      ? await pool.query(query, params) 
      : await pool.query(query);
    res.json(rows);
  } catch (error) {
    console.error('Error listar exámenes:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const obtener = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT e.*, g.nombre as nombre_grupo FROM examenes e JOIN grupos g ON e.id_grupo = g.id WHERE e.id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Examen no encontrado' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error obtener examen:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const crear = async (req, res) => {
  try {
    const { fecha, nombre, hora_inicio, aulas, id_grupo } = req.body;

    const result = await pool.query(
      'INSERT INTO examenes (fecha, nombre, hora_inicio, aulas, id_grupo) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [fecha, nombre, hora_inicio, aulas, id_grupo]
    );

    res.status(201).json({ message: 'Examen creado correctamente', id: result.rows[0].id });
  } catch (error) {
    console.error('Error crear examen:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const { fecha, nombre, hora_inicio, aulas, id_grupo } = req.body;

    const result = await pool.query(
      'UPDATE examenes SET fecha = $1, nombre = $2, hora_inicio = $3, aulas = $4, id_grupo = $5 WHERE id = $6',
      [fecha, nombre, hora_inicio, aulas, id_grupo, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Examen no encontrado' });
    }

    res.json({ message: 'Examen actualizado correctamente' });
  } catch (error) {
    console.error('Error actualizar examen:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const eliminar = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM examenes WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Examen no encontrado' });
    }

    res.json({ message: 'Examen eliminado correctamente' });
  } catch (error) {
    console.error('Error eliminar examen:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const listarAsistencias = async (req, res) => {
  try {
    const { id_examen } = req.params;
    const { rows } = await pool.query(
      `SELECT a.*, e.nombre, e.dni, e.correo FROM asistencia_examen a 
       JOIN estudiantes_asignatura_grupo hag ON a.id_estudiante_asignatura_grupo = hag.id 
       JOIN estudiantes_asignatura ea ON hag.id_estudiante_asignatura = ea.id 
       JOIN estudiantes e ON ea.id_estudiante = e.id 
       WHERE a.id_examen = $1 ORDER BY e.nombre`,
      [id_examen]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error listar asistencia examen:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const guardarAsistencias = async (req, res) => {
  try {
    const { id_examen } = req.params;
    const { asistencialist } = req.body;

    for (const a of asistencialist) {
      await pool.query(
        `INSERT INTO asistencia_examen (asistencia, comentario, id_examen, id_estudiante_asignatura_grupo) 
         VALUES ($1, $2, $3, $4)
         ON CONFLICT(id_examen, id_estudiante_asignatura_grupo) 
         DO UPDATE SET asistencia = $1, comentario = $2`,
        [a.asistencia, a.comentario, id_examen, a.id_estudiante_asignatura_grupo]
      );
    }

    res.json({ message: 'Asistencias guardadas correctamente' });
  } catch (error) {
    console.error('Error guardar asistencia examen:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

module.exports = {
  listar,
  obtener,
  crear,
  actualizar,
  eliminar,
  listarAsistencias,
  guardarAsistencias
};
