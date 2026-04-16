const express = require('express');
const db = require('../config/db');
const auth = require('../middlewares/auth');

const router = express.Router();

router.get('/:id/proximas', auth, (req, res) => {
  const { id } = req.params;

  try {
    const grupos = db.prepare('SELECT id FROM grupos WHERE id_asignatura = ?').all(id);
    const grupoIds = grupos.map(g => g.id);

    if (grupoIds.length === 0) {
      return res.json({ sesiones: [], examenes: [] });
    }

    const placeholders = grupoIds.map(() => '?').join(',');
    const hoy = new Date().toISOString().split('T')[0];

    const sesiones = db.prepare(`
      SELECT
        s.id,
        s.fecha,
        s.hora_inicio,
        s.hora_fin,
        s.aula,
        g.nombre AS grupo,
        g.tipo
      FROM sesiones s
      JOIN grupos g ON g.id = s.id_grupo
      WHERE s.id_grupo IN (${placeholders}) AND s.fecha >= ?
      ORDER BY s.fecha, s.hora_inicio
      LIMIT 5
    `).all(...grupoIds, hoy);

    const examenes = db.prepare(`
      SELECT
        e.id,
        e.fecha,
        e.nombre,
        e.hora_inicio,
        e.aulas,
        g.nombre AS grupo
      FROM examenes e
      JOIN grupos g ON g.id = e.id_grupo
      WHERE e.id_grupo IN (${placeholders}) AND e.fecha >= ?
      ORDER BY e.fecha, e.hora_inicio
      LIMIT 5
    `).all(...grupoIds, hoy);

    return res.json({ sesiones, examenes });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener próximas sesiones' });
  }
});

module.exports = router;
