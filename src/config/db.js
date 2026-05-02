const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/seguimiento.db');

const db = new Database(DB_PATH);

// Activar foreign keys
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// ─── Crear tablas ───────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    apellidos TEXT DEFAULT '',
    correo TEXT UNIQUE NOT NULL,
    usuario TEXT UNIQUE NOT NULL,
    contrasena TEXT NOT NULL,
    rol INTEGER DEFAULT 1,
    ids_asignatura TEXT DEFAULT '[]',
    nombres_asignatura TEXT DEFAULT '[]',
    idioma TEXT DEFAULT 'es',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS titulaciones (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS catalogo_asignaturas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    codigo TEXT NOT NULL,
    creditos INTEGER DEFAULT 6,
    id_titulacion TEXT NOT NULL,
    curso TEXT NOT NULL,
    creada INTEGER DEFAULT 0,
    fecha_inicio TEXT,
    fecha_fin TEXT,
    FOREIGN KEY (id_titulacion) REFERENCES titulaciones(id)
  );

  CREATE TABLE IF NOT EXISTS grupos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    tipo TEXT NOT NULL,
    aula TEXT,
    id_asignatura INTEGER NOT NULL,
    id_profesor INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_asignatura) REFERENCES catalogo_asignaturas(id),
    FOREIGN KEY (id_profesor) REFERENCES usuarios(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS horarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dia TEXT NOT NULL,
    hora_inicio TEXT NOT NULL,
    hora_fin TEXT NOT NULL,
    id_grupo INTEGER NOT NULL,
    FOREIGN KEY (id_grupo) REFERENCES grupos(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS estudiantes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dni TEXT UNIQUE,
    nombre TEXT NOT NULL,
    correo TEXT UNIQUE,
    movilidad TEXT DEFAULT 'No',
    ruta_imagen TEXT DEFAULT 'Sin asignar',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS estudiantes_asignatura (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_estudiante INTEGER NOT NULL,
    id_asignatura INTEGER NOT NULL,
    convocatorias INTEGER DEFAULT 0,
    matriculas INTEGER DEFAULT 0,
    matricula TEXT DEFAULT 'Si',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_estudiante) REFERENCES estudiantes(id) ON DELETE CASCADE,
    FOREIGN KEY (id_asignatura) REFERENCES catalogo_asignaturas(id) ON DELETE CASCADE,
    UNIQUE(id_estudiante, id_asignatura)
  );

  CREATE TABLE IF NOT EXISTS estudiantes_asignatura_grupo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_estudiante_asignatura INTEGER NOT NULL,
    id_grupo INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_estudiante_asignatura) REFERENCES estudiantes_asignatura(id) ON DELETE CASCADE,
    FOREIGN KEY (id_grupo) REFERENCES grupos(id) ON DELETE CASCADE,
    UNIQUE(id_estudiante_asignatura, id_grupo)
  );

  CREATE TABLE IF NOT EXISTS sesiones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL,
    hora_inicio TEXT,
    hora_fin TEXT,
    aula TEXT,
    id_grupo INTEGER NOT NULL,
    id_profesor INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_grupo) REFERENCES grupos(id) ON DELETE CASCADE,
    FOREIGN KEY (id_profesor) REFERENCES usuarios(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS conceptos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    descripcion TEXT NOT NULL,
    id_sesion INTEGER NOT NULL,
    FOREIGN KEY (id_sesion) REFERENCES sesiones(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS asistencia_sesion (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asistencia TEXT DEFAULT 'No',
    posicion INTEGER DEFAULT 0,
    comentario TEXT,
    otro_grupo TEXT DEFAULT 'No',
    id_sesion INTEGER NOT NULL,
    id_estudiante_asignatura_grupo INTEGER NOT NULL,
    FOREIGN KEY (id_sesion) REFERENCES sesiones(id) ON DELETE CASCADE,
    FOREIGN KEY (id_estudiante_asignatura_grupo) REFERENCES estudiantes_asignatura_grupo(id) ON DELETE CASCADE,
    UNIQUE(id_sesion, id_estudiante_asignatura_grupo)
  );

  CREATE TABLE IF NOT EXISTS valoraciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    valoracion INTEGER,
    comentario TEXT,
    id_concepto INTEGER NOT NULL,
    id_estudiante_asignatura_grupo INTEGER NOT NULL,
    FOREIGN KEY (id_concepto) REFERENCES conceptos(id) ON DELETE CASCADE,
    FOREIGN KEY (id_estudiante_asignatura_grupo) REFERENCES estudiantes_asignatura_grupo(id) ON DELETE CASCADE,
    UNIQUE(id_concepto, id_estudiante_asignatura_grupo)
  );

  CREATE TABLE IF NOT EXISTS entregas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entrega TEXT DEFAULT 'No',
    valoracion INTEGER,
    comentario TEXT,
    id_sesion INTEGER NOT NULL,
    id_estudiante_asignatura_grupo INTEGER NOT NULL,
    FOREIGN KEY (id_sesion) REFERENCES sesiones(id) ON DELETE CASCADE,
    FOREIGN KEY (id_estudiante_asignatura_grupo) REFERENCES estudiantes_asignatura_grupo(id) ON DELETE CASCADE,
    UNIQUE(id_sesion, id_estudiante_asignatura_grupo)
  );

  CREATE TABLE IF NOT EXISTS examenes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL,
    nombre TEXT NOT NULL,
    hora_inicio TEXT,
    aulas TEXT,
    id_grupo INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_grupo) REFERENCES grupos(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS asistencia_examen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asistencia TEXT DEFAULT 'No',
    comentario TEXT,
    id_examen INTEGER NOT NULL,
    id_estudiante_asignatura_grupo INTEGER NOT NULL,
    FOREIGN KEY (id_examen) REFERENCES examenes(id) ON DELETE CASCADE,
    FOREIGN KEY (id_estudiante_asignatura_grupo) REFERENCES estudiantes_asignatura_grupo(id) ON DELETE CASCADE,
    UNIQUE(id_examen, id_estudiante_asignatura_grupo)
  );
`);

// ─── Migraciones suaves (columnas añadidas a tablas existentes) ─────────────

function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    console.log(`[DB] Añadida columna ${table}.${column}`);
  }
}

ensureColumn('catalogo_asignaturas', 'fecha_inicio', 'TEXT');
ensureColumn('catalogo_asignaturas', 'fecha_fin', 'TEXT');

// ─── Datos iniciales ─────────────────────────────────────────────────────────

function poblarDatosIniciales() {
  const existing = db.prepare('SELECT COUNT(*) as cnt FROM titulaciones').get();
  if (existing.cnt > 0) return;

  const insertTitulacion = db.prepare('INSERT INTO titulaciones (id, nombre) VALUES (?, ?)');
  const insertAsignatura = db.prepare(
    'INSERT INTO catalogo_asignaturas (nombre, codigo, creditos, id_titulacion, curso) VALUES (?, ?, ?, ?, ?)'
  );

  const seed = db.transaction(() => {
    // Titulaciones
    insertTitulacion.run('giitt', 'Grado en Ingeniería en Tecnologías y Servicios de Telecomunicación');
    insertTitulacion.run('giisof', 'Grado en Ingeniería Informática del Software');

    // ── Catálogo compartido (mismo para ambas titulaciones) ──────────────────
    const titulaciones = ['giitt', 'giisof'];

    // Año 1
    const ano1 = [
      ['Álgebra Lineal', 'AL'],
      ['Organización y Estructura de Computadores', 'OyE'],
      ['Cálculo', 'CAL'],
      ['Estadística', 'EST'],
      ['Empresa', 'EMP'],
      ['Fundamentos de Circuitos y Redes', 'FCR'],
      ['Física', 'FI'],
      ['Análisis Matemático y Diferencial', 'AMD'],
      ['Introducción a la Programación', 'IP'],
      ['Metodología de la Programación', 'MP'],
    ];

    // Año 2
    const ano2 = [
      ['Tecnología Electrónica y Comunicaciones', 'TEC'],
      ['Sistemas Operativos', 'SO'],
      ['Arquitectura de Computadores', 'AC'],
      ['Computación de Altas Prestaciones y Microprocesadores', 'CPM'],
      ['Estructuras de Datos', 'ED'],
      ['Bases de Datos', 'BD'],
      ['Tecnologías y Paradigmas de la Programación', 'TPP'],
      ['Comunicaciones y Redes', 'CN'],
      ['Compiladores', 'COMP'],
      ['Algoritmos', 'ALG'],
    ];

    // Año 3
    const ano3 = [
      ['Redes de Información', 'RI'],
      ['Sistemas Distribuidos', 'SDI'],
      ['Sistemas y Entornos Web', 'SEW'],
      ['Arquitectura y Servicios de Redes', 'ASR'],
      ['Ingeniería del Proceso Software', 'IPS'],
      ['Seguridad en Sistemas Informáticos', 'SSI'],
      ['Diseño de Software', 'DS'],
      ['Arquitectura del Software', 'AS'],
      ['Optativa 1', 'OP1'],
      ['Diseño de Lenguajes de Programación', 'DLP'],
    ];

    // Año 4
    const ano4 = [
      ['Sistemas Inteligentes', 'SI'],
      ['Desarrollo de Proyectos de Programación', 'DPP'],
      ['Ingeniería de Requisitos', 'IR'],
      ['Aspectos Sociales y Legales de la Ingeniería del Software', 'ASLEP'],
      ['Calidad, Verificación y Validación', 'CVV'],
      ['Prácticas en Empresa', 'PE'],
      ['Optativa 2', 'OP2'],
      ['Trabajo Fin de Grado', 'TFG'],
      ['Optativa 3', 'OP3'],
    ];

    for (const tit of titulaciones) {
      for (const [nombre, codigo] of ano1) {
        insertAsignatura.run(nombre, codigo, 6, tit, '1');
      }
      for (const [nombre, codigo] of ano2) {
        insertAsignatura.run(nombre, codigo, 6, tit, '2');
      }
      for (const [nombre, codigo] of ano3) {
        insertAsignatura.run(nombre, codigo, 6, tit, '3');
      }
      for (const [nombre, codigo, creditos] of ano4.map(([n, c]) => [n, c, c === 'TFG' ? 12 : 6])) {
        insertAsignatura.run(nombre, codigo, creditos, tit, '4');
      }
    }
  });

  seed();
  console.log('[DB] Datos iniciales insertados correctamente.');
}

poblarDatosIniciales();

// ─── Usuario admin por defecto ───────────────────────────────────────────────

function seedAdmin() {
  const bcrypt = require('bcrypt');
  const existing = db.prepare("SELECT id FROM usuarios WHERE correo = ?").get('uo271160@uniovi.es');
  if (existing) return;

  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare(`
    INSERT INTO usuarios (nombre, apellidos, correo, usuario, contrasena, rol)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('Admin', 'UO', 'uo271160@uniovi.es', 'uo271160', hash, 0);
  console.log('[DB] Usuario admin creado: uo271160@uniovi.es');
}

seedAdmin();

module.exports = db;
module.exports.poblarDatosIniciales = poblarDatosIniciales;
