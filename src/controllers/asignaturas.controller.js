const pool = require('../config/db');

const listar = async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM asignaturas ORDER BY created_at DESC');
    res.json(rows);
  } catch (error) {
    console.error('Error listar asignaturas:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const obtener = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM asignaturas WHERE id = $1', [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Asignatura no encontrada' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error obtener asignatura:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const crear = async (req, res) => {
  try {
    const { nombre, curso, titulacion, fecha_inicio, fecha_fin } = req.body;

    const result = await pool.query(
      'INSERT INTO asignaturas (nombre, curso, titulacion, fecha_inicio, fecha_fin) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [nombre, curso, titulacion, fecha_inicio, fecha_fin]
    );

    res.status(201).json({ message: 'Asignatura creada correctamente', id: result.rows[0].id });
  } catch (error) {
    console.error('Error crear asignatura:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, curso, titulacion, fecha_inicio, fecha_fin } = req.body;

    const result = await pool.query(
      'UPDATE asignaturas SET nombre = $1, curso = $2, titulacion = $3, fecha_inicio = $4, fecha_fin = $5 WHERE id = $6',
      [nombre, curso, titulacion, fecha_inicio, fecha_fin, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Asignatura no encontrada' });
    }

    res.json({ message: 'Asignatura actualizada correctamente' });
  } catch (error) {
    console.error('Error actualizar asignatura:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const eliminar = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM asignaturas WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Asignatura no encontrada' });
    }

    res.json({ message: 'Asignatura eliminada correctamente' });
  } catch (error) {
    console.error('Error eliminar asignatura:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const listarEstudiantes = async (req, res) => {
  try {
    const { id_asignatura } = req.params;
    const { rows } = await pool.query(
      `SELECT e.*, ea.convocatorias, ea.matriculas, ea.matricula 
       FROM estudiantes_asignatura ea
       JOIN estudiantes e ON ea.id_estudiante = e.id
       WHERE ea.id_asignatura = $1`,
      [id_asignatura]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error listar estudiantes:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const limpiarBaseDatos = async (req, res) => {
  try {
    await pool.query('DELETE FROM asistencia_examen');
    await pool.query('DELETE FROM examenes');
    await pool.query('DELETE FROM entregas');
    await pool.query('DELETE FROM valoraciones');
    await pool.query('DELETE FROM asistencia_sesion');
    await pool.query('DELETE FROM conceptos');
    await pool.query('DELETE FROM sesiones');
    await pool.query('DELETE FROM estudiantes_asignatura_grupo');
    await pool.query('DELETE FROM estudiantes_asignatura');
    await pool.query('DELETE FROM estudiantes');
    await pool.query('DELETE FROM horarios');
    await pool.query('DELETE FROM grupos');
    await pool.query('DELETE FROM asignaturas');

    res.json({ message: 'Base de datos limpiada correctamente' });
  } catch (error) {
    console.error('Error limpiar base de datos:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

module.exports = {
  listar,
  obtener,
  crear,
  actualizar,
  eliminar,
  listarEstudiantes,
  limpiarBaseDatos
};
