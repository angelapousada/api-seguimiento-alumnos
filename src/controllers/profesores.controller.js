const bcrypt = require('bcrypt');
const db = require('../config/db');

const listar = async (req, res) => {
  try {
    const rows = db.prepare('SELECT id, nombre, correo, usuario, rol, created_at FROM profesores').all();
    res.json(rows);
  } catch (error) {
    console.error('Error listar profesores:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const crear = async (req, res) => {
  try {
    const { nombre, correo, usuario, contrasena } = req.body;

    const existing = db.prepare('SELECT id FROM profesores WHERE usuario = ? OR correo = ?').all(usuario, correo);

    if (existing.length > 0) {
      return res.status(400).json({ error: 'El usuario o correo ya existe' });
    }

    const hashedPassword = await bcrypt.hash(contrasena, 10);

    const result = db.prepare(
      'INSERT INTO profesores (nombre, correo, usuario, contrasena, rol) VALUES (?, ?, ?, ?, ?)'
    ).run(nombre, correo, usuario, hashedPassword, 'profesor');

    res.status(201).json({ message: 'Profesor creado correctamente', id: result.lastInsertRowid });
  } catch (error) {
    console.error('Error crear profesor:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const borrar = async (req, res) => {
  try {
    const { id } = req.params;

    const result = db.prepare('DELETE FROM profesores WHERE id = ?').run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Profesor no encontrado' });
    }

    res.json({ message: 'Profesor eliminado correctamente' });
  } catch (error) {
    console.error('Error borrar profesor:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

module.exports = { listar, crear, borrar };
