const db = require('../config/db');

const listar = async (req, res) => {
  try {
    const { id_asignatura, tipo } = req.query;
    let query = 'SELECT g.*, p.nombre as nombre_profesor FROM grupos g LEFT JOIN profesores p ON g.id_profesor = p.id';
    const params = [];
    const conditions = [];

    if (id_asignatura) {
      conditions.push('g.id_asignatura = ?');
      params.push(id_asignatura);
    }
    if (tipo) {
      conditions.push('g.tipo = ?');
      params.push(tipo);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY g.nombre';
    const stmt = db.prepare(query);
    const rows = params.length > 0 ? stmt.all(...params) : stmt.all();
    res.json(rows);
  } catch (error) {
    console.error('Error listar grupos:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const obtener = async (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare(`SELECT g.*, p.nombre as nombre_profesor FROM grupos g LEFT JOIN profesores p ON g.id_profesor = p.id WHERE g.id = ?`);
    const rows = stmt.all(id);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }

    const horarios = db.prepare('SELECT * FROM horarios WHERE id_grupo = ?').all(id);
    rows[0].horarios = horarios;

    res.json(rows[0]);
  } catch (error) {
    console.error('Error obtener grupo:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const crear = async (req, res) => {
  try {
    const { nombre, tipo, aula, id_asignatura, id_profesor, horarios } = req.body;

    const result = db.prepare(
      'INSERT INTO grupos (nombre, tipo, aula, id_asignatura, id_profesor) VALUES (?, ?, ?, ?, ?)'
    ).run(nombre, tipo, aula, id_asignatura, id_profesor);

    const id_grupo = result.lastInsertRowid;

    if (horarios && horarios.length > 0) {
      const insertHorario = db.prepare('INSERT INTO horarios (dia, hora_inicio, hora_fin, id_grupo) VALUES (?, ?, ?, ?)');
      for (const h of horarios) {
        insertHorario.run(h.dia, h.hora_inicio, h.hora_fin, id_grupo);
      }
    }

    res.status(201).json({ message: 'Grupo creado correctamente', id: id_grupo });
  } catch (error) {
    console.error('Error crear grupo:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, tipo, aula, id_profesor, horarios } = req.body;

    db.prepare('UPDATE grupos SET nombre = ?, tipo = ?, aula = ?, id_profesor = ? WHERE id = ?')
      .run(nombre, tipo, aula, id_profesor, id);

    db.prepare('DELETE FROM horarios WHERE id_grupo = ?').run(id);

    if (horarios && horarios.length > 0) {
      const insertHorario = db.prepare('INSERT INTO horarios (dia, hora_inicio, hora_fin, id_grupo) VALUES (?, ?, ?, ?)');
      for (const h of horarios) {
        insertHorario.run(h.dia, h.hora_inicio, h.hora_fin, id);
      }
    }

    res.json({ message: 'Grupo actualizado correctamente' });
  } catch (error) {
    console.error('Error actualizar grupo:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const eliminar = async (req, res) => {
  try {
    const { id } = req.params;
    const result = db.prepare('DELETE FROM grupos WHERE id = ?').run(id);

    if (result.changes === 0) {
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
    const stmt = db.prepare(`SELECT e.*, hag.id as id_relacion FROM estudiantes_asignatura_grupo hag JOIN estudiantes_asignatura ea ON hag.id_estudiante_asignatura = ea.id JOIN estudiantes e ON ea.id_estudiante = e.id WHERE hag.id_grupo = ? ORDER BY e.nombre`);
    const rows = stmt.all(id_grupo);
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

    let relacion = db.prepare('SELECT id FROM estudiantes_asignatura WHERE id_estudiante = ? AND id_asignatura = ?').all(id_estudiante, id_asignatura);

    let id_relacion;
    if (relacion.length === 0) {
      const result = db.prepare('INSERT INTO estudiantes_asignatura (id_estudiante, id_asignatura) VALUES (?, ?)').run(id_estudiante, id_asignatura);
      id_relacion = result.lastInsertRowid;
    } else {
      id_relacion = relacion[0].id;
    }

    try {
      db.prepare('INSERT INTO estudiantes_asignatura_grupo (id_estudiante_asignatura, id_grupo) VALUES (?, ?)').run(id_relacion, id_grupo);
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

    db.prepare('UPDATE estudiantes_asignatura_grupo SET id_grupo = ? WHERE id = ?').run(id_grupo_destino, id_estudiante_asignatura_grupo);

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
