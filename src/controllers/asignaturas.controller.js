const db = require('../config/db');

const listar = async (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM asignaturas ORDER BY created_at DESC').all();
    res.json(rows);
  } catch (error) {
    console.error('Error listar asignaturas:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const obtener = async (req, res) => {
  try {
    const { id } = req.params;
    const rows = db.prepare('SELECT * FROM asignaturas WHERE id = ?').all(id);

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

    const result = db.prepare(
      'INSERT INTO asignaturas (nombre, curso, titulacion, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?, ?)'
    ).run(nombre, curso, titulacion, fecha_inicio, fecha_fin);

    res.status(201).json({ message: 'Asignatura creada correctamente', id: result.lastInsertRowid });
  } catch (error) {
    console.error('Error crear asignatura:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, curso, titulacion, fecha_inicio, fecha_fin } = req.body;

    const result = db.prepare(
      'UPDATE asignaturas SET nombre = ?, curso = ?, titulacion = ?, fecha_inicio = ?, fecha_fin = ? WHERE id = ?'
    ).run(nombre, curso, titulacion, fecha_inicio, fecha_fin, id);

    if (result.changes === 0) {
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
    const result = db.prepare('DELETE FROM asignaturas WHERE id = ?').run(id);

    if (result.changes === 0) {
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
    const rows = db.prepare(
      `SELECT e.*, ea.convocatorias, ea.matriculas, ea.matricula 
       FROM estudiantes_asignatura ea
       JOIN estudiantes e ON ea.id_estudiante = e.id
       WHERE ea.id_asignatura = ?`
    ).all(id_asignatura);
    res.json(rows);
  } catch (error) {
    console.error('Error listar estudiantes:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const limpiarBaseDatos = async (req, res) => {
  try {
    db.exec(`
      DELETE FROM asistencia_examen;
      DELETE FROM examenes;
      DELETE FROM entregas;
      DELETE FROM valoraciones;
      DELETE FROM asistencia_sesion;
      DELETE FROM conceptos;
      DELETE FROM sesiones;
      DELETE FROM estudiantes_asignatura_grupo;
      DELETE FROM estudiantes_asignatura;
      DELETE FROM estudiantes;
      DELETE FROM horarios;
      DELETE FROM grupos;
      DELETE FROM asignaturas;
    `);

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
