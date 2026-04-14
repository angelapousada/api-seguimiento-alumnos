const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS profesores (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        correo TEXT UNIQUE NOT NULL,
        usuario TEXT UNIQUE NOT NULL,
        contrasena TEXT NOT NULL,
        rol TEXT DEFAULT 'profesor',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS asignaturas (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        curso TEXT NOT NULL,
        titulacion TEXT NOT NULL,
        fecha_inicio TEXT,
        fecha_fin TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS estudiantes (
        id SERIAL PRIMARY KEY,
        dni TEXT UNIQUE,
        nombre TEXT NOT NULL,
        correo TEXT UNIQUE,
        movilidad TEXT DEFAULT 'No',
        ruta_imagen TEXT DEFAULT 'Sin asignar',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS estudiantes_asignatura (
        id SERIAL PRIMARY KEY,
        id_estudiante INTEGER NOT NULL,
        id_asignatura INTEGER NOT NULL,
        convocatorias INTEGER DEFAULT 0,
        matriculas INTEGER DEFAULT 0,
        matricula TEXT DEFAULT 'No',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS grupos (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        tipo TEXT NOT NULL,
        aula TEXT,
        id_asignatura INTEGER NOT NULL,
        id_profesor INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS horarios (
        id SERIAL PRIMARY KEY,
        dia TEXT NOT NULL,
        hora_inicio TEXT NOT NULL,
        hora_fin TEXT NOT NULL,
        id_grupo INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS estudiantes_asignatura_grupo (
        id SERIAL PRIMARY KEY,
        id_estudiante_asignatura INTEGER NOT NULL,
        id_grupo INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sesiones (
        id SERIAL PRIMARY KEY,
        fecha TEXT NOT NULL,
        hora_inicio TEXT,
        hora_fin TEXT,
        aula TEXT,
        id_grupo INTEGER NOT NULL,
        id_profesor INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS conceptos (
        id SERIAL PRIMARY KEY,
        descripcion TEXT NOT NULL,
        id_sesion INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS asistencia_sesion (
        id SERIAL PRIMARY KEY,
        asistencia TEXT DEFAULT 'No',
        posicion INTEGER DEFAULT 0,
        comentario TEXT,
        otro_grupo TEXT DEFAULT 'No',
        id_sesion INTEGER NOT NULL,
        id_estudiante_asignatura_grupo INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS valoraciones (
        id SERIAL PRIMARY KEY,
        valoracion INTEGER,
        comentario TEXT,
        id_concepto INTEGER NOT NULL,
        id_estudiante_asignatura_grupo INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS entregas (
        id SERIAL PRIMARY KEY,
        entrega TEXT DEFAULT 'No',
        valoracion INTEGER,
        comentario TEXT,
        id_sesion INTEGER NOT NULL,
        id_estudiante_asignatura_grupo INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS examenes (
        id SERIAL PRIMARY KEY,
        fecha TEXT NOT NULL,
        nombre TEXT NOT NULL,
        hora_inicio TEXT,
        aulas TEXT,
        id_grupo INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS asistencia_examen (
        id SERIAL PRIMARY KEY,
        asistencia TEXT DEFAULT 'No',
        comentario TEXT,
        id_examen INTEGER NOT NULL,
        id_estudiante_asignatura_grupo INTEGER NOT NULL
      );
    `);
    console.log('Base de datos PostgreSQL inicializada');
  } finally {
    client.release();
  }
}

initDB().catch(console.error);

module.exports = pool;
