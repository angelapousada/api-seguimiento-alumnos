const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data/seguimiento.db'));
db.pragma('foreign_keys = ON');

const titCount = db.prepare('SELECT COUNT(*) as cnt FROM titulaciones').get();
const catCount = db.prepare('SELECT COUNT(*) as cnt FROM catalogo_asignaturas').get();

if (titCount.cnt > 0 || catCount.cnt > 0) {
  console.log(`Ya hay datos: ${titCount.cnt} titulaciones, ${catCount.cnt} asignaturas en catálogo.`);
  console.log('Borrando para reinsertar...');
  db.prepare('DELETE FROM catalogo_asignaturas').run();
  db.prepare('DELETE FROM titulaciones').run();
}

const insertTit = db.prepare('INSERT INTO titulaciones (id, nombre) VALUES (?, ?)');
const insertAsig = db.prepare(
  'INSERT INTO catalogo_asignaturas (nombre, codigo, creditos, id_titulacion, curso) VALUES (?, ?, ?, ?, ?)'
);

const seed = db.transaction(() => {
  insertTit.run('giitt', 'Grado en Ingeniería en Tecnologías y Servicios de Telecomunicación');
  insertTit.run('giisof', 'Grado en Ingeniería Informática del Software');

  const titulaciones = ['giitt', 'giisof'];

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

  const ano4 = [
    ['Sistemas Inteligentes', 'SI', 6],
    ['Desarrollo de Proyectos de Programación', 'DPP', 6],
    ['Ingeniería de Requisitos', 'IR', 6],
    ['Aspectos Sociales y Legales de la Ingeniería del Software', 'ASLEP', 6],
    ['Calidad, Verificación y Validación', 'CVV', 6],
    ['Prácticas en Empresa', 'PE', 6],
    ['Optativa 2', 'OP2', 6],
    ['Trabajo Fin de Grado', 'TFG', 12],
    ['Optativa 3', 'OP3', 6],
  ];

  for (const tit of titulaciones) {
    for (const [nombre, codigo] of ano1) insertAsig.run(nombre, codigo, 6, tit, '1');
    for (const [nombre, codigo] of ano2) insertAsig.run(nombre, codigo, 6, tit, '2');
    for (const [nombre, codigo] of ano3) insertAsig.run(nombre, codigo, 6, tit, '3');
    for (const [nombre, codigo, creditos] of ano4) insertAsig.run(nombre, codigo, creditos, tit, '4');
  }
});

seed();

const total = db.prepare('SELECT COUNT(*) as cnt FROM catalogo_asignaturas').get();
console.log(`✓ Asignaturas en catálogo: ${total.cnt}`);

db.close();
