const pool = require('../config/db');

const listar = async (req, res) => {
  try {
    const { id_asignatura, tipo } = req.query;
    let query = 'SELECT g.*, p.nombre as nombre_profesor FROM grupos g LEFT JOIN profesores p ON g.id_profesor = p.id';
    const params = [];
    const conditions = [];

    if (id_asignatura) {
      conditions.push('g.id_asignatura = $' + (params.length + 1));
      params.push(id_asignatura);
    }
    if (tipo) {
      conditions.push('g.tipo = $' + (params.length + 1));
      params.push(tipo);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY g.nombre';
    const { rows } = params.length > 0 
      ? await pool.query(query, params) 
      : await pool.query(query);
    res.json(rows);
  } catch (error) {
    console.error('Error listar grupos:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const obtener = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT g.*, p.nombre as nombre_profesor FROM grupos g LEFT JOIN profesores p ON g.id_profesor = p.id WHERE g.id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }

    const { rows: horarios } = await pool.query('SELECT * FROM horarios WHERE id_grupo = $1', [id]);
    rows[0].horarios = horarios;

    res.json(rows[0]);
  } catch (error) {
    console.error('Error obtener grupo:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const crear = async (req, res) => {
  const client = await pool.connect();
  try {
    const { nombre, tipo, aula, id_asignatura, id_profesor, horarios } = req.body;

    await client.query('BEGIN');

    const result = await client.query(
      'INSERT INTO grupos (nombre, tipo, aula, id_asignatura, id_profesor) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [nombre, tipo, aula, id_asignatura, id_profesor]
    );

    const id_grupo = result.rows[0].id;

    if (horarios && horarios.length > 0) {
      for (const h of horarios) {
        await client.query(
          'INSERT INTO horarios (dia, hora_inicio, hora_fin, id_grupo) VALUES ($1, $2, $3, $4)',
          [h.dia, h.hora_inicio, h.hora_fin, id_grupo]
        );
      }
    }

    await client.query('COMMIT');

    res.status(201).json({ message: 'Grupo creado correctamente', id: id_grupo });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error crear grupo:', error);
    res.status(500).json({ error: 'Error del servidor' });
  } finally {
    client.release();
  }
};

const actualizar = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { nombre, tipo, aula, id_profesor, horarios } = req.body;

    await client.query('BEGIN');

    await client.query(
      'UPDATE grupos SET nombre = $1, tipo = $2, aula = $3, id_profesor = $4 WHERE id = $5',
      [nombre, tipo, aula, id_profesor, id]
    );

    await client.query('DELETE FROM horarios WHERE id_grupo = $1', [id]);

    if (horarios && horarios.length > 0) {
      for (const h of horarios) {
        await client.query(
          'INSERT INTO horarios (dia, hora_inicio, hora_fin, id_grupo) VALUES ($1, $2, $3, $4)',
          [h.dia, h.hora_inicio, h.hora_fin, id]
        );
      }
    }

    await client.query('COMMIT');

    res.json({ message: 'Grupo actualizado correctamente' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error actualizar grupo:', error);
    res.status(500).json({ error: 'Error del servidor' });
  } finally {
    client.release();
  }
};

const eliminar = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM grupos WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }

    res.json({ message: 'Grupo eliminado correctamente' });
  } catch (error) {
    console.error('Error eliminar grupo:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const listarEstudiantes = async (req, res) => {
  try {
    const { id_grupo } = req.params;
    const { rows } = await pool.query(
      `SELECT e.*, hag.id as id_relacion FROM estudiantes_asignatura_grupo hag 
       JOIN estudiantes_asignatura ea ON hag.id_estudiante_asignatura = ea.id 
       JOIN estudiantes e ON ea.id_estudiante = e.id 
       WHERE hag.id_grupo = $1 ORDER BY e.nombre`,
      [id_grupo]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error listar estudiantes del grupo:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const agregarEstudiante = async (req, res) => {
  try {
    const { id_grupo } = req.params;
    const { id_estudiante, id_asignatura } = req.body;

    let { rows: relacion } = await pool.query(
      'SELECT id FROM estudiantes_asignatura WHERE id_estudiante = $1 AND id_asignatura = $2',
      [id_estudiante, id_asignatura]
    );

    let id_relacion;
    if (relacion.length === 0) {
      const result = await pool.query(
        'INSERT INTO estudiantes_asignatura (id_estudiante, id_asignatura) VALUES ($1, $2) RETURNING id',
        [id_estudiante, id_asignatura]
      );
      id_relacion = result.rows[0].id;
    } else {
      id_relacion = relacion[0].id;
    }

    try {
      await pool.query(
        'INSERT INTO estudiantes_asignatura_grupo (id_estudiante_asignatura, id_grupo) VALUES ($1, $2)',
        [id_relacion, id_grupo]
      );
    } catch (e) {
      // Ignore duplicate
    }

    res.json({ message: 'Estudiante agregado al grupo correctamente' });
  } catch (error) {
    console.error('Error agregar estudiante:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const moverEstudiante = async (req, res) => {
  try {
    const { id_grupo_destino } = req.params;
    const { id_estudiante_asignatura_grupo } = req.body;

    await pool.query(
      'UPDATE estudiantes_asignatura_grupo SET id_grupo = $1 WHERE id = $2',
      [id_grupo_destino, id_estudiante_asignatura_grupo]
    );

    res.json({ message: 'Estudiante movido correctamente' });
  } catch (error) {
    console.error('Error mover estudiante:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

module.exports = {
  listar,
  obtener,
  crear,
  actualizar,
  eliminar,
  listarEstudiantes,
  agregarEstudiante,
  moverEstudiante
};
