const express = require('express');
const db = require('../config/db');
const { poblarDatosIniciales } = require('../config/db');
const auth = require('../middlewares/auth');
const isAdmin = require('../middlewares/isAdmin');

const router = express.Router();

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
      // Desactivadas (no borradas) para que el admin las reactive manualmente.
      db.prepare("UPDATE catalogo_asignaturas SET creada = 0").run();
    });

    vaciar();
    return res.json({ mensaje: 'Base de datos vaciada correctamente' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al vaciar la base de datos' });
  }
});

router.post('/reseed', auth, isAdmin, (req, res) => {
  try {
    const { cnt } = db.prepare('SELECT COUNT(*) as cnt FROM grupos').get();
    if (cnt > 0) {
      return res.status(400).json({
        error: 'Hay asignaturas activas con grupos. Vacía la base de datos primero.',
      });
    }

    // Orden importa: catalogo_asignaturas tiene FK a titulaciones.
    db.prepare('DELETE FROM catalogo_asignaturas').run();
    db.prepare('DELETE FROM titulaciones').run();

    poblarDatosIniciales();

    return res.json({ mensaje: 'Catálogo y titulaciones restaurados correctamente' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al restaurar el catálogo' });
  }
});

module.exports = router;
