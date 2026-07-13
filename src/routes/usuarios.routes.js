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

function reemplazarAsignaturasUsuario(idUsuario, ids) {
  db.prepare('DELETE FROM usuarios_asignatura WHERE id_usuario = ?').run(idUsuario);
  const existe = db.prepare('SELECT 1 FROM catalogo_asignaturas WHERE id = ?');
  const insertar = db.prepare(
    'INSERT OR IGNORE INTO usuarios_asignatura (id_usuario, id_asignatura) VALUES (?, ?)'
  );
  for (const x of Array.isArray(ids) ? ids : []) {
    const n = Number(x);
    if (!Number.isNaN(n) && existe.get(n)) {
      insertar.run(idUsuario, n);
    }
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
    ...asignaturasDeUsuario(u.id),
    idioma: u.idioma,
    ruta_imagen: u.ruta_imagen,
    created_at: u.created_at,
  };
}

router.get('/', auth, isAdmin, (req, res) => {
  try {
    const usuarios = db.prepare('SELECT * FROM usuarios ORDER BY rol, nombre, apellidos').all();
    return res.json(usuarios.map(formatUsuario));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

router.post('/', auth, isAdmin, async (req, res) => {
  const { nombre, apellidos, correo, contrasena, rol, ids_asignatura } = req.body;

  if (!nombre || !correo || !contrasena) {
    return res.status(400).json({ error: 'nombre, correo y contrasena son obligatorios' });
  }

  try {
    const hash = await bcrypt.hash(contrasena, 10);
    const usuarioLogin = correo.split('@')[0];
    const rolInt = rol !== undefined ? parseInt(rol, 10) : 1;

    const crear = db.transaction(() => {
      const result = db
        .prepare(`
          INSERT INTO usuarios (nombre, apellidos, correo, usuario, contrasena, rol)
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        .run(nombre, apellidos || '', correo, usuarioLogin, hash, rolInt);
      const idNuevo = result.lastInsertRowid;
      reemplazarAsignaturasUsuario(idNuevo, ids_asignatura);
      return idNuevo;
    });

    const idNuevo = crear();
    const nuevo = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(idNuevo);
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
  const { nombre, apellidos, idioma, correo, contrasena, ids_asignatura, rol } = req.body;

  try {
    const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // El rol solo lo puede modificar un administrador.
    let rolFinal = usuario.rol;
    if (rol !== undefined && req.user.rol === 0) {
      const rolInt = parseInt(rol, 10) === 0 ? 0 : 1;
      // Nadie puede cambiar su propio rol en su propia sesión.
      if (String(req.user.id) === String(id) && rolInt !== usuario.rol) {
        return res.status(400).json({
          codigo: 'no_cambiar_propio_rol',
          error: 'No puedes cambiar tu propio rol',
        });
      }
      // Salvaguarda: no degradar al último administrador.
      if (usuario.rol === 0 && rolInt !== 0) {
        const admins = db.prepare('SELECT COUNT(*) AS cnt FROM usuarios WHERE rol = 0').get();
        if (admins.cnt <= 1) {
          return res.status(400).json({
            codigo: 'ultimo_admin',
            error: 'No se puede degradar al último administrador',
          });
        }
      }
      rolFinal = rolInt;
    }

    const correoFinal =
      correo !== undefined && req.user.rol === 0 ? correo : usuario.correo;

    const puedeCambiarContrasena =
      String(req.user.id) === String(id) || req.user.rol === 0;
    const hashContrasena =
      contrasena !== undefined &&
      String(contrasena).length > 0 &&
      puedeCambiarContrasena
        ? bcrypt.hashSync(String(contrasena), 10)
        : null;

    const actualizar = db.transaction(() => {
      db.prepare(`
        UPDATE usuarios
        SET nombre = ?, apellidos = ?, correo = ?, idioma = ?, rol = ?
        WHERE id = ?
      `).run(
        nombre !== undefined ? nombre : usuario.nombre,
        apellidos !== undefined ? apellidos : usuario.apellidos,
        correoFinal,
        idioma !== undefined ? idioma : usuario.idioma,
        rolFinal,
        id
      );
      if (ids_asignatura !== undefined && req.user.rol === 0) {
        reemplazarAsignaturasUsuario(id, ids_asignatura);
      }
      if (hashContrasena) {
        db.prepare('UPDATE usuarios SET contrasena = ? WHERE id = ?').run(
          hashContrasena,
          id
        );
      }
    });
    actualizar();

    const actualizado = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
    return res.json(formatUsuario(actualizado));
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'El correo ya existe' });
    }
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
    if (String(req.user.id) === String(id)) {
      return res.status(400).json({ codigo: 'no_eliminarte', error: 'No puedes eliminarte a ti mismo' });
    }

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
