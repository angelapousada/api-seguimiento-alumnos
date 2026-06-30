const express = require('express');
const db = require('../config/db');
const { poblarDatosIniciales, seedAdmin } = require('../config/db');
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

module.exports = router;
