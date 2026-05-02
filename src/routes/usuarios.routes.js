const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../config/db');
const auth = require('../middlewares/auth');
const isAdmin = require('../middlewares/isAdmin');

const router = express.Router();

function parseJSON(value) {
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function formatUsuario(u) {
  return {
    id: u.id,
    nombre: u.nombre,
    apellidos: u.apellidos,
    correo: u.correo,
    usuario: u.usuario,
    rol: u.rol,
    ids_asignatura: parseJSON(u.ids_asignatura),
    nombres_asignatura: parseJSON(u.nombres_asignatura),
    idioma: u.idioma,
    created_at: u.created_at,
  };
}

// GET /api/usuarios - lista todos los usuarios (admin)
router.get('/', auth, isAdmin, (req, res) => {
  try {
    const usuarios = db.prepare('SELECT * FROM usuarios').all();
    return res.json(usuarios.map(formatUsuario));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// POST /api/usuarios - crear usuario (admin)
router.post('/', auth, isAdmin, async (req, res) => {
  const { nombre, apellidos, correo, contrasena, rol, ids_asignatura, nombres_asignatura } = req.body;

  if (!nombre || !correo || !contrasena) {
    return res.status(400).json({ error: 'nombre, correo y contrasena son obligatorios' });
  }

  try {
    const hash = await bcrypt.hash(contrasena, 10);
    const usuarioLogin = correo.split('@')[0];
    const rolInt = rol !== undefined ? parseInt(rol, 10) : 1;
    const idsJSON = JSON.stringify(Array.isArray(ids_asignatura) ? ids_asignatura : []);
    const nombresJSON = JSON.stringify(Array.isArray(nombres_asignatura) ? nombres_asignatura : []);

    const stmt = db.prepare(`
      INSERT INTO usuarios (nombre, apellidos, correo, usuario, contrasena, rol, ids_asignatura, nombres_asignatura)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      nombre,
      apellidos || '',
      correo,
      usuarioLogin,
      hash,
      rolInt,
      idsJSON,
      nombresJSON
    );

    const nuevo = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json(formatUsuario(nuevo));
  } catch (err) {
    console.error(err);
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'El correo o usuario ya existe' });
    }
    return res.status(500).json({ error: 'Error al crear usuario' });
  }
});

// PUT /api/usuarios/:id - actualizar usuario (auth)
router.put('/:id', auth, (req, res) => {
  const { id } = req.params;
  const { nombre, apellidos, idioma, ids_asignatura, nombres_asignatura } = req.body;

  try {
    const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const idsJSON = ids_asignatura !== undefined
      ? JSON.stringify(Array.isArray(ids_asignatura) ? ids_asignatura : [])
      : usuario.ids_asignatura;
    const nombresJSON = nombres_asignatura !== undefined
      ? JSON.stringify(Array.isArray(nombres_asignatura) ? nombres_asignatura : [])
      : usuario.nombres_asignatura;

    db.prepare(`
      UPDATE usuarios
      SET nombre = ?, apellidos = ?, idioma = ?, ids_asignatura = ?, nombres_asignatura = ?
      WHERE id = ?
    `).run(
      nombre !== undefined ? nombre : usuario.nombre,
      apellidos !== undefined ? apellidos : usuario.apellidos,
      idioma !== undefined ? idioma : usuario.idioma,
      idsJSON,
      nombresJSON,
      id
    );

    const actualizado = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
    return res.json(formatUsuario(actualizado));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

// DELETE /api/usuarios/:id - eliminar usuario (admin) manteniendo valoraciones
router.delete('/:id', auth, isAdmin, (req, res) => {
  const { id } = req.params;

  try {
    const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    if (usuario.rol !== 1) {
      return res.status(400).json({ error: 'Solo se pueden eliminar cuentas de profesor' });
    }

    const tieneValoraciones = db.prepare(`
      SELECT COUNT(*) as cnt FROM sesiones WHERE id_profesor = ?
    `).get(id);

    if (tieneValoraciones.cnt > 0) {
      return res.status(400).json({
        error: 'No se puede eliminar el profesor porque tiene sesiones asociadas',
        sesiones: tieneValoraciones.cnt
      });
    }

    const result = db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
    return res.json({ mensaje: 'Usuario eliminado correctamente' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al eliminar usuario' });
  }
});

module.exports = router;
