const db = require('../config/db');

const listar = async (req, res) => {
  try {
    const { id_grupo, id_asignatura } = req.query;
    let query = `SELECT s.*, g.nombre as nombre_grupo FROM sesiones s JOIN grupos g ON s.id_grupo = g.id`;
    const params = [];
    const conditions = [];

    if (id_grupo) {
      conditions.push('s.id_grupo = ?');
      params.push(id_grupo);
    }
    if (id_asignatura) {
      conditions.push('g.id_asignatura = ?');
      params.push(id_asignatura);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY s.fecha DESC';
    const stmt = db.prepare(query);
    const rows = params.length > 0 ? stmt.all(...params) : stmt.all();
    res.json(rows);
  } catch (error) {
    console.error('Error listar sesiones:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const obtener = async (req, res) => {
  try {
    const { id } = req.params;
    const sesiones = db.prepare(`SELECT s.*, g.nombre as nombre_grupo FROM sesiones s JOIN grupos g ON s.id_grupo = g.id WHERE s.id = ?`).all(id);

    if (sesiones.length === 0) {
      return res.status(404).json({ error: 'Sesión no encontrada' });
    }

    const conceptos = db.prepare('SELECT * FROM conceptos WHERE id_sesion = ?').all(id);
    sesiones[0].conceptos = conceptos;

    res.json(sesiones[0]);
  } catch (error) {
    console.error('Error obtener sesión:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const crear = async (req, res) => {
  try {
    const { fecha, hora_inicio, hora_fin, aula, id_grupo, id_profesor, conceptos } = req.body;

    const result = db.prepare(
      'INSERT INTO sesiones (fecha, hora_inicio, hora_fin, aula, id_grupo, id_profesor) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(fecha, hora_inicio, hora_fin, aula, id_grupo, id_profesor);

    const id_sesion = result.lastInsertRowid;

    if (conceptos && conceptos.length > 0) {
      const insertConcepto = db.prepare('INSERT INTO conceptos (descripcion, id_sesion) VALUES (?, ?)');
      for (const c of conceptos) {
        insertConcepto.run(c.descripcion, id_sesion);
      }
    }

    res.status(201).json({ message: 'Sesión creada correctamente', id: id_sesion });
  } catch (error) {
    console.error('Error crear sesión:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const { fecha, hora_inicio, hora_fin, aula, id_profesor, conceptos } = req.body;

    db.prepare('UPDATE sesiones SET fecha = ?, hora_inicio = ?, hora_fin = ?, aula = ?, id_profesor = ? WHERE id = ?')
      .run(fecha, hora_inicio, hora_fin, aula, id_profesor, id);

    db.prepare('DELETE FROM conceptos WHERE id_sesion = ?').run(id);

    if (conceptos && conceptos.length > 0) {
      const insertConcepto = db.prepare('INSERT INTO conceptos (descripcion, id_sesion) VALUES (?, ?)');
      for (const c of conceptos) {
        insertConcepto.run(c.descripcion, id);
      }
    }

    res.json({ message: 'Sesión actualizada correctamente' });
  } catch (error) {
    console.error('Error actualizar sesión:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const eliminar = async (req, res) => {
  try {
    const { id } = req.params;
    const result = db.prepare('DELETE FROM sesiones WHERE id = ?').run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Sesión no encontrada' });
    }

    res.json({ message: 'Sesión eliminada correctamente' });
  } catch (error) {
    console.error('Error eliminar sesión:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const listarAsistencias = async (req, res) => {
  try {
    const { id_sesion } = req.params;
    const stmt = db.prepare(`SELECT a.*, e.nombre, e.dni, e.correo FROM asistencia_sesion a JOIN estudiantes_asignatura_grupo hag ON a.id_estudiante_asignatura_grupo = hag.id JOIN estudiantes_asignatura ea ON hag.id_estudiante_asignatura = ea.id JOIN estudiantes e ON ea.id_estudiante = e.id WHERE a.id_sesion = ? ORDER BY a.posicion`);
    const rows = stmt.all(id_sesion);
    res.json(rows);
  } catch (error) {
    console.error('Error listar asistencias:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const guardarAsistencias = async (req, res) => {
  try {
    const { id_sesion } = req.params;
    const { asistencialist } = req.body;

    const upsert = db.prepare(`INSERT INTO asistencia_sesion (asistencia, posicion, comentario, otro_grupo, id_sesion, id_estudiante_asignatura_grupo) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id_sesion, id_estudiante_asignatura_grupo) DO UPDATE SET asistencia = ?, posicion = ?, comentario = ?, otro_grupo = ?`);

    for (const a of asistencialist) {
      upsert.run(a.asistencia, a.posicion || 0, a.comentario, a.otro_grupo, id_sesion, a.id_estudiante_asignatura_grupo,
                 a.asistencia, a.posicion || 0, a.comentario, a.otro_grupo);
    }

    res.json({ message: 'Asistencias guardadas correctamente' });
  } catch (error) {
    console.error('Error guardar asistencias:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const listarValoraciones = async (req, res) => {
  try {
    const { id_sesion } = req.params;
    const stmt = db.prepare(`SELECT v.*, c.descripcion as concepto, e.nombre as nombre_estudiante FROM valoraciones v JOIN conceptos c ON v.id_concepto = c.id JOIN estudiantes_asignatura_grupo hag ON v.id_estudiante_asignatura_grupo = hag.id JOIN estudiantes_asignatura ea ON hag.id_estudiante_asignatura = ea.id JOIN estudiantes e ON ea.id_estudiante = e.id WHERE c.id_sesion = ?`);
    const rows = stmt.all(id_sesion);
    res.json(rows);
  } catch (error) {
    console.error('Error listar valoraciones:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const guardarValoraciones = async (req, res) => {
  try {
    const { id_sesion } = req.params;
    const { valoraciones } = req.body;

    const upsert = db.prepare(`INSERT INTO valoraciones (valoracion, comentario, id_concepto, id_estudiante_asignatura_grupo) VALUES (?, ?, ?, ?) ON CONFLICT(id_concepto, id_estudiante_asignatura_grupo) DO UPDATE SET valoracion = ?, comentario = ?`);

    for (const v of valoraciones) {
      upsert.run(v.valoracion, v.comentario, v.id_concepto, v.id_estudiante_asignatura_grupo, v.valoracion, v.comentario);
    }

    res.json({ message: 'Valoraciones guardadas correctamente' });
  } catch (error) {
    console.error('Error guardar valoraciones:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const listarEntregas = async (req, res) => {
  try {
    const { id_sesion } = req.params;
    const stmt = db.prepare(`SELECT ent.*, e.nombre as nombre_estudiante FROM entregas ent JOIN estudiantes_asignatura_grupo hag ON ent.id_estudiante_asignatura_grupo = hag.id JOIN estudiantes_asignatura ea ON hag.id_estudiante_asignatura = ea.id JOIN estudiantes e ON ea.id_estudiante = e.id WHERE ent.id_sesion = ?`);
    const rows = stmt.all(id_sesion);
    res.json(rows);
  } catch (error) {
    console.error('Error listar entregas:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const guardarEntregas = async (req, res) => {
  try {
    const { id_sesion } = req.params;
    const { entregas } = req.body;

    const upsert = db.prepare(`INSERT INTO entregas (entrega, valoracion, comentario, id_sesion, id_estudiante_asignatura_grupo) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id_sesion, id_estudiante_asignatura_grupo) DO UPDATE SET entrega = ?, valoracion = ?, comentario = ?`);

    for (const e of entregas) {
      upsert.run(e.entrega, e.valoracion, e.comentario, id_sesion, e.id_estudiante_asignatura_grupo, e.entrega, e.valoracion, e.comentario);
    }

    res.json({ message: 'Entregas guardadas correctamente' });
  } catch (error) {
    console.error('Error guardar entregas:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

module.exports = {
  listar,
  obtener,
  crear,
  actualizar,
  eliminar,
  listarAsistencias,
  guardarAsistencias,
  listarValoraciones,
  guardarValoraciones,
  listarEntregas,
  guardarEntregas
};
