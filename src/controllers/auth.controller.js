const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const login = async (req, res) => {
  try {
    const { usuario, contrasena } = req.body;

    if (!usuario || !contrasena) {
      return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
    }

    const { rows } = await pool.query('SELECT * FROM profesores WHERE usuario = $1', [usuario]);

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const profesor = rows[0];
    const validPassword = await bcrypt.compare(contrasena, profesor.contrasena);

    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      { id: profesor.id, rol: profesor.rol },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      usuario: {
        id: profesor.id,
        nombre: profesor.nombre,
        correo: profesor.correo,
        usuario: profesor.usuario,
        rol: profesor.rol
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const register = async (req, res) => {
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
    console.error('Error en register:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

module.exports = { login, register };
