const express = require('express');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../config/db');
const auth = require('../middlewares/auth');
const isAdmin = require('../middlewares/isAdmin');

const router = express.Router();

const PERFILES_DIR = path.join(__dirname, '../../uploads/perfiles');
if (!fs.existsSync(PERFILES_DIR)) {
  fs.mkdirSync(PERFILES_DIR, { recursive: true });
}

const IMG_EXTS = ['.jpg', '.jpeg', '.png'];

const uploadImagenPerfil = multer({
  dest: 'uploads/',
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (IMG_EXTS.includes(ext)) return cb(null, true);
    return cb(null, false);
  },
});

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
    ruta_imagen: u.ruta_imagen,
    created_at: u.created_at,
  };
}

router.get('/', auth, isAdmin, (req, res) => {
  try {
    const usuarios = db.prepare('SELECT * FROM usuarios').all();
    return res.json(usuarios.map(formatUsuario));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

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

router.put('/:id', auth, (req, res) => {
  const { id } = req.params;
  const { nombre, apellidos, idioma, ids_asignatura, nombres_asignatura } = req.body;

  try {
    const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    let idsJSON;
    let nombresJSON;
    if (ids_asignatura !== undefined) {
      const idsArr = Array.isArray(ids_asignatura) ? ids_asignatura : [];
      idsJSON = JSON.stringify(idsArr);
      if (idsArr.length === 0) {
        nombresJSON = JSON.stringify([]);
      } else {
        const placeholders = idsArr.map(() => '?').join(',');
        const filas = db
          .prepare(
            `SELECT id, nombre FROM catalogo_asignaturas WHERE id IN (${placeholders})`
          )
          .all(...idsArr);
        const porId = new Map(filas.map((r) => [String(r.id), r.nombre]));
        nombresJSON = JSON.stringify(
          idsArr.map((x) => porId.get(String(x)) ?? String(x))
        );
      }
    } else {
      idsJSON = usuario.ids_asignatura;
      nombresJSON = nombres_asignatura !== undefined
        ? JSON.stringify(Array.isArray(nombres_asignatura) ? nombres_asignatura : [])
        : usuario.nombres_asignatura;
    }

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

router.post('/:id/imagen', auth, uploadImagenPerfil.single('imagen'), (req, res) => {
  const { id } = req.params;
  const fichero = req.file;

  if (!fichero) {
    return res.status(400).json({ error: 'Imagen no proporcionada (jpg/jpeg/png).' });
  }

  // Solo el propio usuario o un admin pueden cambiar la imagen.
  if (String(req.user.id) !== String(id) && req.user.rol !== 0) {
    try { fs.unlinkSync(fichero.path); } catch (_) {}
    return res.status(403).json({ error: 'No autorizado' });
  }

  try {
    const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
    if (!usuario) {
      try { fs.unlinkSync(fichero.path); } catch (_) {}
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const ext = path.extname(fichero.originalname).toLowerCase();
    const base = `usuario_${id}`;
    const destinoRel = path.join('uploads', 'perfiles', `${base}${ext}`);
    const destinoAbs = path.join(__dirname, '../../', destinoRel);

    // Limpiamos versiones anteriores con cualquier extensión.
    for (const e of IMG_EXTS) {
      const previo = path.join(PERFILES_DIR, `${base}${e}`);
      if (previo !== destinoAbs && fs.existsSync(previo)) {
        try { fs.unlinkSync(previo); } catch (_) {}
      }
    }

    fs.renameSync(fichero.path, destinoAbs);
    const rutaFinal = `/${destinoRel.replace(/\\/g, '/')}`;
    db.prepare('UPDATE usuarios SET ruta_imagen = ? WHERE id = ?').run(rutaFinal, id);

    const actualizado = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
    return res.json(formatUsuario(actualizado));
  } catch (err) {
    console.error('[usuarios/imagen]', err);
    try { fs.unlinkSync(fichero.path); } catch (_) {}
    return res.status(500).json({ error: 'Error al guardar la imagen' });
  }
});

router.delete('/:id', auth, isAdmin, (req, res) => {
  const { id } = req.params;

  try {
    const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
    if (!usuario) {
      return res.status(404).json({ codigo: 'usuario_no_encontrado', error: 'Usuario no encontrado' });
    }

    if (usuario.rol !== 1) {
      return res.status(400).json({ codigo: 'solo_profesores', error: 'Solo se pueden eliminar cuentas de profesor' });
    }

    const grupos = db
      .prepare('SELECT COUNT(*) as cnt FROM grupos WHERE id_profesor = ?')
      .get(id);
    const sesiones = db
      .prepare('SELECT COUNT(*) as cnt FROM sesiones WHERE id_profesor = ?')
      .get(id);

    db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);

    return res.json({
      codigo: 'profesor_eliminado',
      mensaje: 'Usuario eliminado correctamente',
      grupos_desvinculados: grupos.cnt,
      sesiones_desvinculadas: sesiones.cnt,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ codigo: 'error_eliminar_usuario', error: 'Error al eliminar usuario' });
  }
});

module.exports = router;
