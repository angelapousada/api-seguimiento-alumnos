const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/seguimiento.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '../../data/backups');

function abrirConexion() {
  const conn = new Database(DB_PATH);
  conn.pragma('foreign_keys = ON');
  conn.pragma('journal_mode = WAL');
  return conn;
}

// Conexión viva. Se reasigna al restaurar una copia de seguridad.
let conexion = abrirConexion();

// Los demás módulos hacen `require('../config/db')` una sola vez, así que
// exponemos un Proxy que siempre delega en la conexión actual. Así, tras
// restaurar una copia (que crea una conexión nueva), esas referencias siguen
// apuntando a la base de datos correcta sin quedarse obsoletas.
const helpers = {};
const db = new Proxy(
  {},
  {
    get(_t, prop) {
      if (prop in helpers) return helpers[prop];
      const valor = conexion[prop];
      return typeof valor === 'function' ? valor.bind(conexion) : valor;
    },
    set(_t, prop, valor) {
      helpers[prop] = valor;
      return true;
    },
  }
);

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    apellidos TEXT DEFAULT '',
    correo TEXT UNIQUE NOT NULL,
    usuario TEXT UNIQUE NOT NULL,
    contrasena TEXT NOT NULL,
    rol INTEGER DEFAULT 1,
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

  CREATE TABLE IF NOT EXISTS usuarios_asignatura (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_usuario INTEGER NOT NULL,
    id_asignatura INTEGER NOT NULL,
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (id_asignatura) REFERENCES catalogo_asignaturas(id) ON DELETE CASCADE,
    UNIQUE(id_usuario, id_asignatura)
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
    necesidades_especiales TEXT DEFAULT 'No',
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

function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    console.log(`[DB] Añadida columna ${table}.${column}`);
  }
}

ensureColumn('catalogo_asignaturas', 'fecha_inicio', 'TEXT');
ensureColumn('catalogo_asignaturas', 'fecha_fin', 'TEXT');
ensureColumn('estudiantes_asignatura', 'evaluacion_diferenciada', "TEXT DEFAULT 'No'");
ensureColumn('estudiantes', 'necesidades_especiales', "TEXT DEFAULT 'No'");
ensureColumn('estudiantes', 'plan', "TEXT DEFAULT ''");
ensureColumn('usuarios', 'ruta_imagen', "TEXT DEFAULT 'Sin asignar'");
ensureColumn('grupos', 'entregas_activadas', 'INTEGER DEFAULT 0');
db.prepare("UPDATE grupos SET entregas_activadas = 1 WHERE tipo = 'Laboratorio'").run();

// Migración: traslada la relación profesor-asignatura, antes desnormalizada en
// las columnas usuarios.ids_asignatura/nombres_asignatura, a la tabla
// intermedia usuarios_asignatura.
function migrarUsuariosAsignatura() {
  const cols = db.prepare('PRAGMA table_info(usuarios)').all();
  if (!cols.some((c) => c.name === 'ids_asignatura')) return;

  const existeAsignatura = db.prepare('SELECT 1 FROM catalogo_asignaturas WHERE id = ?');
  const insertar = db.prepare(
    'INSERT OR IGNORE INTO usuarios_asignatura (id_usuario, id_asignatura) VALUES (?, ?)'
  );

  const migrar = db.transaction(() => {
    for (const u of db.prepare('SELECT id, ids_asignatura FROM usuarios').all()) {
      let ids = [];
      try {
        ids = JSON.parse(u.ids_asignatura || '[]');
      } catch (_) {
        ids = [];
      }
      for (const x of ids) {
        const n = Number(x);
        // Se descartan los identificadores que ya no existen en el catálogo
        // para no violar la clave foránea.
        if (!Number.isNaN(n) && existeAsignatura.get(n)) {
          insertar.run(u.id, n);
        }
      }
    }
    db.exec('ALTER TABLE usuarios DROP COLUMN ids_asignatura');
    db.exec('ALTER TABLE usuarios DROP COLUMN nombres_asignatura');
  });

  migrar();
  console.log('[DB] Relación profesor-asignatura migrada a usuarios_asignatura');
}

migrarUsuariosAsignatura();

function poblarDatosIniciales() {
  const existing = db.prepare('SELECT COUNT(*) as cnt FROM titulaciones').get();
  if (existing.cnt > 0) return;

  const insertTitulacion = db.prepare('INSERT INTO titulaciones (id, nombre) VALUES (?, ?)');
  const insertAsignatura = db.prepare(
    'INSERT INTO catalogo_asignaturas (nombre, codigo, creditos, id_titulacion, curso) VALUES (?, ?, ?, ?, ?)'
  );

  const seed = db.transaction(() => {
    insertTitulacion.run('giitt', 'Grado en Ingeniería Informática en Tecnologías de la Información');
    insertTitulacion.run('giisof', 'Grado en Ingeniería Informática del Software');

    const ano1 = [
      ['Álgebra Lineal', 'AL'],
      ['Ondas y Electromagnetismo', 'OE'],
      ['Cálculo', 'CAL'],
      ['Estadística', 'EST'],
      ['Empresa', 'EMP'],
      ['Fundamentos de Computadores y Redes', 'FCR'],
      ['Fundamentos de Informática', 'FINF'],
      ['Autómatas y Matemáticas Discretas', 'AMD'],
      ['Introducción a la Programación', 'IP'],
      ['Metodología de la Programación', 'MP'],
    ];

    const ano2 = [
      ['Tecnología Electrónica de Computadores', 'TEC'],
      ['Sistemas Operativos', 'SO'],
      ['Arquitectura de Computadores', 'AC'],
      ['Comunicación Persona-Máquina', 'CPM'],
      ['Estructuras de Datos', 'ED'],
      ['Bases de Datos', 'BD'],
      ['Tecnología y Paradigmas de la Programación', 'TPP'],
      ['Computación Numérica', 'CN'],
      ['Computabilidad', 'COMP'],
      ['Algoritmia', 'ALG'],
    ];

    const ano3Giisof = [
      ['Repositorios de Información', 'RI'],
      ['Sistemas Distribuidos e Internet', 'SDI'],
      ['Software y Estándares para la Web', 'SEW'],
      ['Administración de Sistemas y Redes', 'ASR'],
      ['Ingeniería del Proceso Software', 'IPS'],
      ['Seguridad de Sistemas Informáticos', 'SSI'],
      ['Diseño del Software', 'DS'],
      ['Arquitectura del Software', 'AS'],
      ['Diseño de Lenguajes de Programación', 'DLP'],
    ];

    const ano3Giitt = [
      ['Redes de Computadores', 'RC'],
      ['Ingeniería del Software', 'IS'],
      ['Configuración y Evaluación de Sistemas', 'CES'],
      ['Administración de Sistemas', 'AS'],
      ['Programación Concurrente y Paralela', 'PCP'],
      ['Sistemas Inteligentes', 'SI'],
      ['Sistemas Distribuidos', 'SD'],
      ['Infraestructura Informática', 'II'],
      ['Ingeniería de Redes', 'IR'],
      ['Sistemas de Información', 'SI2'],
    ];

    const ano4Cores = [
      ['Sistemas Inteligentes', 'SI'],
      ['Dirección y Planificación de Proyectos Informáticos', 'DPP'],
      ['Ingeniería de Requisitos', 'IR'],
      ['Aspectos Sociales, Legales, Éticos y Profesionales de la Informática', 'ASLEP'],
      ['Calidad, Validación y Verificación del Software', 'CVV'],
      ['Prácticas Externas', 'PE'],
    ];

    const optativasGiisof = [
      ['Informática Audiovisual', 'IAUD'],
      ['Integración de Aplicaciones Empresariales', 'IAE'],
      ['Realidad y Accesibilidad Aumentadas', 'RAA'],
      ['Software de Entretenimiento y Videojuegos', 'SEV'],
      ['Software para Robots', 'SR'],
      ['Informática Forense y Auditoría', 'IFA'],
      ['Modelos en Ingeniería del Software', 'MIS'],
      ['Sistemas de Información para la Web', 'SIW'],
      ['Software para Dispositivos Móviles', 'SDM'],
    ];

    const optativasGiitt = [
      ['Prácticas en Empresa', 'PEMP'],
      ['Aspectos Legales y Profesionales de la Informática', 'ALPI'],
      ['Servicios Multimedia Interactivos', 'SMI'],
      ['Informática Móvil', 'IM'],
      ['Pruebas y Despliegue de Software', 'PDS'],
      ['Inteligencia Ambiental', 'IAMB'],
    ];

    for (const tit of ['giitt', 'giisof']) {
      const ano3 = tit === 'giisof' ? ano3Giisof : ano3Giitt;
      const optativas = tit === 'giisof' ? optativasGiisof : optativasGiitt;

      for (const [nombre, codigo] of ano1) {
        insertAsignatura.run(nombre, codigo, 6, tit, '1');
      }
      for (const [nombre, codigo] of ano2) {
        insertAsignatura.run(nombre, codigo, 6, tit, '2');
      }
      for (const [nombre, codigo] of ano3) {
        insertAsignatura.run(nombre, codigo, 6, tit, '3');
      }
      for (const [nombre, codigo] of ano4Cores) {
        insertAsignatura.run(nombre, codigo, 6, tit, '4');
      }
      for (const [nombre, codigo] of optativas) {
        insertAsignatura.run(nombre, codigo, 6, tit, '4');
      }
    }
  });

  seed();
  console.log('[DB] Datos iniciales insertados correctamente.');
}

poblarDatosIniciales();

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

// Devuelve una imagen completa (Buffer) de la base de datos actual, lista para
// descargar como fichero de copia de seguridad.
function serializarBaseDatos() {
  conexion.pragma('wal_checkpoint(TRUNCATE)');
  return conexion.serialize();
}

function serializarBaseDatosSinImagenes() {
  const tmp = DB_PATH + '.sinimg';
  fs.writeFileSync(tmp, serializarBaseDatos());
  const copia = new Database(tmp);
  try {
    copia.exec(`
      UPDATE estudiantes SET ruta_imagen = 'Sin asignar';
      UPDATE usuarios SET ruta_imagen = 'Sin asignar';
    `);
    copia.pragma('wal_checkpoint(TRUNCATE)');
    return copia.serialize();
  } finally {
    copia.close();
    for (const ext of ['', '-wal', '-shm']) {
      try {
        fs.unlinkSync(tmp + ext);
      } catch (_) {
        /* el fichero puede no existir */
      }
    }
  }
}

// Guarda una copia de seguridad del estado actual en BACKUP_DIR y devuelve la
// ruta del fichero generado.
function guardarCopiaSeguridad(sello) {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  const marca = (sello || new Date().toISOString()).replace(/[:.]/g, '-');
  const destino = path.join(BACKUP_DIR, `seguimiento_${marca}.db`);
  fs.writeFileSync(destino, serializarBaseDatos());
  return destino;
}

// Reemplaza la base de datos en una sola operación: valida el fichero recibido,
// guarda una copia de seguridad del estado actual y sustituye la BD viva.
function reemplazarBaseDatos(buffer) {
  const tmp = DB_PATH + '.nuevo';
  fs.writeFileSync(tmp, buffer);

  // 1. Validar que el fichero es una BD SQLite coherente con este proyecto.
  //    Se valida sobre un fichero real (no un Buffer) para que el modo WAL de
  //    la cabecera pueda gestionarse correctamente.
  let prueba;
  try {
    prueba = new Database(tmp);
    const tabla = prueba
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='usuarios'"
      )
      .get();
    if (!tabla) {
      throw new Error('no contiene datos de esta aplicación');
    }
  } catch (err) {
    if (prueba) prueba.close();
    for (const ext of ['', '-wal', '-shm']) {
      fs.rmSync(tmp + ext, { force: true });
    }
    throw new Error(
      'El fichero no es una copia de seguridad válida (' + err.message + ')'
    );
  }
  prueba.close();
  // Limpiar los ficheros auxiliares WAL del temporal antes de sustituir.
  for (const ext of ['-wal', '-shm']) {
    fs.rmSync(tmp + ext, { force: true });
  }

  // 2. Copia de seguridad automática del estado actual antes de reemplazar.
  const copiaPrevia = guardarCopiaSeguridad();

  // 3. Cerrar la conexión viva y sustituir la BD de forma atómica.
  conexion.close();
  for (const ext of ['-wal', '-shm']) {
    fs.rmSync(DB_PATH + ext, { force: true });
  }
  fs.renameSync(tmp, DB_PATH);

  // 4. Reabrir la conexión sobre la BD restaurada.
  conexion = abrirConexion();

  return { copiaPrevia };
}

module.exports = db;
module.exports.poblarDatosIniciales = poblarDatosIniciales;
module.exports.seedAdmin = seedAdmin;
module.exports.serializarBaseDatos = serializarBaseDatos;
module.exports.serializarBaseDatosSinImagenes = serializarBaseDatosSinImagenes;
module.exports.guardarCopiaSeguridad = guardarCopiaSeguridad;
module.exports.reemplazarBaseDatos = reemplazarBaseDatos;
module.exports.DB_PATH = DB_PATH;
module.exports.BACKUP_DIR = BACKUP_DIR;
