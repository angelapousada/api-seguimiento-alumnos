const express = require('express');
const multer = require('multer');
const db = require('../config/db');
const {
  poblarDatosIniciales,
  seedAdmin,
  serializarBaseDatos,
  reemplazarBaseDatos,
} = require('../config/db');
const auth = require('../middlewares/auth');
const isAdmin = require('../middlewares/isAdmin');

const router = express.Router();

const uploadBackup = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

router.post('/vaciar', auth, isAdmin, (req, res) => {
  try {
    const vaciar = db.transaction(() => {
      db.exec(`
        DELETE FROM asistencia_examen;
        DELETE FROM examenes;
        DELETE FROM valoraciones;
        DELETE FROM entregas;
        DELETE FROM conceptos;
        DELETE FROM asistencia_sesion;
        DELETE FROM sesiones;
        DELETE FROM estudiantes_asignatura_grupo;
        DELETE FROM estudiantes_asignatura;
        DELETE FROM estudiantes;
        DELETE FROM grupos;
        DELETE FROM horarios;
      `);
      db.prepare(
        "DELETE FROM usuarios WHERE correo != 'uo271160@uniovi.es'"
      ).run();
      db.prepare('DELETE FROM catalogo_asignaturas').run();
      db.prepare('DELETE FROM titulaciones').run();
    });

    vaciar();
    poblarDatosIniciales();
    seedAdmin();

    return res.json({
      mensaje: 'Base de datos vaciada y catálogo restaurado correctamente',
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al vaciar la base de datos' });
  }
});

router.post('/vaciar-parcial', auth, isAdmin, (req, res) => {
  try {
    const vaciar = db.transaction(() => {
      db.exec(`
        DELETE FROM valoraciones;
        DELETE FROM entregas;
        DELETE FROM asistencia_sesion;
        DELETE FROM conceptos;
        DELETE FROM sesiones;
        DELETE FROM asistencia_examen;
        DELETE FROM estudiantes_asignatura_grupo;
        DELETE FROM estudiantes_asignatura;
        DELETE FROM estudiantes;
      `);
    });

    vaciar();

    return res.json({
      mensaje: 'Sesiones y alumnado eliminados correctamente',
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error en el borrado parcial' });
  }
});

// Descarga una copia de seguridad de la base de datos actual.
router.get('/backup', auth, isAdmin, (req, res) => {
  try {
    const buffer = serializarBaseDatos();
    const marca = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="backup_seguimiento_${marca}.db"`
    );
    return res.send(buffer);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al generar la copia de seguridad' });
  }
});

// Restaura la base de datos a partir de un fichero de copia previo. En una sola
// operación guarda una copia del estado actual y reemplaza la BD por la subida.
router.post('/restaurar', auth, isAdmin, uploadBackup.single('archivo'), (req, res) => {
  if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
    return res.status(400).json({ error: 'No se ha recibido ningún fichero' });
  }

  try {
    const { copiaPrevia } = reemplazarBaseDatos(req.file.buffer);
    // Garantizamos que el catálogo y el admin existan tras la restauración.
    poblarDatosIniciales();
    seedAdmin();
    return res.json({
      mensaje: 'Base de datos restaurada correctamente',
      copiaPrevia,
    });
  } catch (err) {
    console.error(err);
    return res.status(400).json({ error: err.message || 'Error al restaurar la copia' });
  }
});

module.exports = router;
