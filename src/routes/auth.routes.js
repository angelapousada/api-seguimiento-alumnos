const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { correo, contrasena } = req.body;

  if (!correo || !contrasena) {
    return res.status(400).json({ error: 'Correo y contraseña son obligatorios' });
  }

  try {
    const usuario = db.prepare('SELECT * FROM usuarios WHERE correo = ?').get(correo);

    if (!usuario) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const coincide = await bcrypt.compare(contrasena, usuario.contrasena);
    if (!coincide) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const token = jwt.sign(
      { id: usuario.id, rol: usuario.rol },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.json({
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        apellidos: usuario.apellidos,
        correo: usuario.correo,
        rol: usuario.rol,
        ...asignaturasDeUsuario(usuario.id),
        idioma: usuario.idioma,
        ruta_imagen: usuario.ruta_imagen,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

function asignaturasDeUsuario(idUsuario) {
  const filas = db
    .prepare(
      `SELECT ca.id, ca.nombre
       FROM usuarios_asignatura ua
       JOIN catalogo_asignaturas ca ON ca.id = ua.id_asignatura
       WHERE ua.id_usuario = ?
       ORDER BY ca.id`
    )
    .all(idUsuario);
  return {
    ids_asignatura: filas.map((f) => f.id),
    nombres_asignatura: filas.map((f) => f.nombre),
  };
}

module.exports = router;
