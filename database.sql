-- Base de datos SQLite para seguimiento de estudiantes

CREATE TABLE IF NOT EXISTS profesores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    correo TEXT UNIQUE NOT NULL,
    usuario TEXT UNIQUE NOT NULL,
    contrasena TEXT NOT NULL,
    rol TEXT DEFAULT 'profesor',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS asignaturas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    curso TEXT NOT NULL,
    titulacion TEXT NOT NULL,
    fecha_inicio TEXT,
    fecha_fin TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    matricula TEXT DEFAULT 'No',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_estudiante) REFERENCES estudiantes(id) ON DELETE CASCADE,
    FOREIGN KEY (id_asignatura) REFERENCES asignaturas(id) ON DELETE CASCADE,
    UNIQUE(id_estudiante, id_asignatura)
);

CREATE TABLE IF NOT EXISTS grupos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    tipo TEXT NOT NULL,
    aula TEXT,
    id_asignatura INTEGER NOT NULL,
    id_profesor INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_asignatura) REFERENCES asignaturas(id) ON DELETE CASCADE,
    FOREIGN KEY (id_profesor) REFERENCES profesores(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS horarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dia TEXT NOT NULL,
    hora_inicio TEXT NOT NULL,
    hora_fin TEXT NOT NULL,
    id_grupo INTEGER NOT NULL,
    FOREIGN KEY (id_grupo) REFERENCES grupos(id) ON DELETE CASCADE
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
    FOREIGN KEY (id_profesor) REFERENCES profesores(id) ON DELETE SET NULL
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
