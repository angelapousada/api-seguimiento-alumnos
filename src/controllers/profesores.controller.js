const bcrypt = require('bcrypt');
const pool = require('../config/db');

const listar = async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, nombre, correo, usuario, rol, created_at FROM profesores');
    res.json(rows);
  } catch (error) {
    console.error('Error listar profesores:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const crear = async (req, res) => {
  try {
    const { nombre, correo, usuario, contrasena } = req.body;

    const existing = await pool.query(
      'SELECT id FROM profesores WHERE usuario = $1 OR correo = $2',
      [usuario, correo]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'El usuario o correo ya existe' });
    }

    const hashedPassword = await bcrypt.hash(contrasena, 10);

    const result = await pool.query(
      'INSERT INTO profesores (nombre, correo, usuario, contrasena, rol) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [nombre, correo, usuario, hashedPassword, 'profesor']
    );

    res.status(201).json({ message: 'Profesor creado correctamente', id: result.rows[0].id });
  } catch (error) {
    console.error('Error crear profesor:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const borrar = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query('DELETE FROM profesores WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Profesor no encontrado' });
    }

    res.json({ message: 'Profesor eliminado correctamente' });
  } catch (error) {
    console.error('Error borrar profesor:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

module.exports = { listar, crear, borrar };
