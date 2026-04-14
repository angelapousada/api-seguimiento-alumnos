const pool = require('../config/db');

const listar = async (req, res) => {
  try {
    const { id_grupo, id_asignatura } = req.query;
    let query = `SELECT s.*, g.nombre as nombre_grupo FROM sesiones s JOIN grupos g ON s.id_grupo = g.id`;
    const params = [];
    const conditions = [];

    if (id_grupo) {
      conditions.push('s.id_grupo = $' + (params.length + 1));
      params.push(id_grupo);
    }
    if (id_asignatura) {
      conditions.push('g.id_asignatura = $' + (params.length + 1));
      params.push(id_asignatura);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY s.fecha DESC';
    const { rows } = params.length > 0 
      ? await pool.query(query, params) 
      : await pool.query(query);
    res.json(rows);
  } catch (error) {
    console.error('Error listar sesiones:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const obtener = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: sesiones } = await pool.query(
      `SELECT s.*, g.nombre as nombre_grupo FROM sesiones s JOIN grupos g ON s.id_grupo = g.id WHERE s.id = $1`,
      [id]
    );

    if (sesiones.length === 0) {
      return res.status(404).json({ error: 'Sesión no encontrada' });
    }

    const { rows: conceptos } = await pool.query('SELECT * FROM conceptos WHERE id_sesion = $1', [id]);
    sesiones[0].conceptos = conceptos;

    res.json(sesiones[0]);
  } catch (error) {
    console.error('Error obtener sesión:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const crear = async (req, res) => {
  const client = await pool.connect();
  try {
    const { fecha, hora_inicio, hora_fin, aula, id_grupo, id_profesor, conceptos } = req.body;

    await client.query('BEGIN');

    const result = await client.query(
      'INSERT INTO sesiones (fecha, hora_inicio, hora_fin, aula, id_grupo, id_profesor) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [fecha, hora_inicio, hora_fin, aula, id_grupo, id_profesor]
    );

    const id_sesion = result.rows[0].id;

    if (conceptos && conceptos.length > 0) {
      for (const c of conceptos) {
        await client.query(
          'INSERT INTO conceptos (descripcion, id_sesion) VALUES ($1, $2)',
          [c.descripcion, id_sesion]
        );
      }
    }

    await client.query('COMMIT');

    res.status(201).json({ message: 'Sesión creada correctamente', id: id_sesion });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error crear sesión:', error);
    res.status(500).json({ error: 'Error del servidor' });
  } finally {
    client.release();
  }
};

const actualizar = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { fecha, hora_inicio, hora_fin, aula, id_profesor, conceptos } = req.body;

    await client.query('BEGIN');

    await client.query(
      'UPDATE sesiones SET fecha = $1, hora_inicio = $2, hora_fin = $3, aula = $4, id_profesor = $5 WHERE id = $6',
      [fecha, hora_inicio, hora_fin, aula, id_profesor, id]
    );

    await client.query('DELETE FROM conceptos WHERE id_sesion = $1', [id]);

    if (conceptos && conceptos.length > 0) {
      for (const c of conceptos) {
        await client.query(
          'INSERT INTO conceptos (descripcion, id_sesion) VALUES ($1, $2)',
          [c.descripcion, id]
        );
      }
    }

    await client.query('COMMIT');

    res.json({ message: 'Sesión actualizada correctamente' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error actualizar sesión:', error);
    res.status(500).json({ error: 'Error del servidor' });
  } finally {
    client.release();
  }
};

const eliminar = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM sesiones WHERE id = $1', [id]);

    if (result.rowCount === 0) {
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
    const { rows } = await pool.query(
      `SELECT a.*, e.nombre, e.dni, e.correo FROM asistencia_sesion a 
       JOIN estudiantes_asignatura_grupo hag ON a.id_estudiante_asignatura_grupo = hag.id 
       JOIN estudiantes_asignatura ea ON hag.id_estudiante_asignatura = ea.id 
       JOIN estudiantes e ON ea.id_estudiante = e.id 
       WHERE a.id_sesion = $1 ORDER BY a.posicion`,
      [id_sesion]
    );
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

    for (const a of asistencialist) {
      await pool.query(
        `INSERT INTO asistencia_sesion (asistencia, posicion, comentario, otro_grupo, id_sesion, id_estudiante_asignatura_grupo) 
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT(id_sesion, id_estudiante_asignatura_grupo) 
         DO UPDATE SET asistencia = $1, posicion = $2, comentario = $3, otro_grupo = $4`,
        [a.asistencia, a.posicion || 0, a.comentario, a.otro_grupo, id_sesion, a.id_estudiante_asignatura_grupo]
      );
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
    const { rows } = await pool.query(
      `SELECT v.*, c.descripcion as concepto, e.nombre as nombre_estudiante FROM valoraciones v 
       JOIN conceptos c ON v.id_concepto = c.id 
       JOIN estudiantes_asignatura_grupo hag ON v.id_estudiante_asignatura_grupo = hag.id 
       JOIN estudiantes_asignatura ea ON hag.id_estudiante_asignatura = ea.id 
       JOIN estudiantes e ON ea.id_estudiante = e.id 
       WHERE c.id_sesion = $1`,
      [id_sesion]
    );
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

    for (const v of valoraciones) {
      await pool.query(
        `INSERT INTO valoraciones (valoracion, comentario, id_concepto, id_estudiante_asignatura_grupo) 
         VALUES ($1, $2, $3, $4)
         ON CONFLICT(id_concepto, id_estudiante_asignatura_grupo) 
         DO UPDATE SET valoracion = $1, comentario = $2`,
        [v.valoracion, v.comentario, v.id_concepto, v.id_estudiante_asignatura_grupo]
      );
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
    const { rows } = await pool.query(
      `SELECT ent.*, e.nombre as nombre_estudiante FROM entregas ent 
       JOIN estudiantes_asignatura_grupo hag ON ent.id_estudiante_asignatura_grupo = hag.id 
       JOIN estudiantes_asignatura ea ON hag.id_estudiante_asignatura = ea.id 
       JOIN estudiantes e ON ea.id_estudiante = e.id 
       WHERE ent.id_sesion = $1`,
      [id_sesion]
    );
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

    for (const e of entregas) {
      await pool.query(
        `INSERT INTO entregas (entrega, valoracion, comentario, id_sesion, id_estudiante_asignatura_grupo) 
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT(id_sesion, id_estudiante_asignatura_grupo) 
         DO UPDATE SET entrega = $1, valoracion = $2, comentario = $3`,
        [e.entrega, e.valoracion, e.comentario, id_sesion, e.id_estudiante_asignatura_grupo]
      );
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
