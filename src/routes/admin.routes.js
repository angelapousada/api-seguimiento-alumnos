const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const db = require('../config/db');
const {
  poblarDatosIniciales,
  seedAdmin,
  serializarBaseDatos,
  reemplazarBaseDatos,
} = require('../config/db');
const auth = require('../middlewares/auth');
const isAdmin = require('../middlewares/isAdmin');

const router = express.Router();

const PERFILES_DIR = path.join(__dirname, '../../uploads/perfiles');
const DB_ENTRY = 'seguimiento.db';
const IMG_PREFIX = 'perfiles/';

const uploadBackup = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

router.post('/vaciar', auth, isAdmin, (req, res) => {
  try {
    const vaciar = db.transaction(() => {
      db.exec(`
        DELETE FROM asistencia_examen;
        DELETE FROM examenes;
        DELETE FROM valoraciones;
        DELETE FROM entregas;
        DELETE FROM conceptos;
        DELETE FROM asistencia_sesion;
        DELETE FROM sesiones;
        DELETE FROM estudiantes_asignatura_grupo;
        DELETE FROM estudiantes_asignatura;
        DELETE FROM estudiantes;
        DELETE FROM grupos;
        DELETE FROM horarios;
      `);
      db.prepare(
        "DELETE FROM usuarios WHERE correo != 'uo271160@uniovi.es'"
      ).run();
      db.prepare('DELETE FROM catalogo_asignaturas').run();
      db.prepare('DELETE FROM titulaciones').run();
    });

    vaciar();
    poblarDatosIniciales();
    seedAdmin();

    return res.json({
      mensaje: 'Base de datos vaciada y catálogo restaurado correctamente',
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al vaciar la base de datos' });
  }
});

router.post('/vaciar-parcial', auth, isAdmin, (req, res) => {
  try {
    const vaciar = db.transaction(() => {
      db.exec(`
        DELETE FROM valoraciones;
        DELETE FROM entregas;
        DELETE FROM asistencia_sesion;
        DELETE FROM conceptos;
        DELETE FROM sesiones;
        DELETE FROM asistencia_examen;
        DELETE FROM estudiantes_asignatura_grupo;
        DELETE FROM estudiantes_asignatura;
        DELETE FROM estudiantes;
      `);
    });

    vaciar();

    return res.json({
      mensaje: 'Sesiones y alumnado eliminados correctamente',
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error en el borrado parcial' });
  }
});

router.get('/backup', auth, isAdmin, (req, res) => {
  try {
    const zip = new AdmZip();
    zip.addFile(DB_ENTRY, serializarBaseDatos());

    if (fs.existsSync(PERFILES_DIR)) {
      for (const nombre of fs.readdirSync(PERFILES_DIR)) {
        const ruta = path.join(PERFILES_DIR, nombre);
        if (fs.statSync(ruta).isFile()) {
          zip.addLocalFile(ruta, 'perfiles');
        }
      }
    }

    const marca = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="backup_seguimiento_${marca}.zip"`
    );
    return res.send(zip.toBuffer());
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al generar la copia de seguridad' });
  }
});

const esZip = (buf) =>
  buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;

function restaurarImagenesDeZip(zip) {
  let restauradas = 0;
  if (!fs.existsSync(PERFILES_DIR)) {
    fs.mkdirSync(PERFILES_DIR, { recursive: true });
  }
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    if (!entry.entryName.startsWith(IMG_PREFIX)) continue;
    // Solo el nombre de fichero
    const base = path.basename(entry.entryName);
    if (!base) continue;
    fs.writeFileSync(path.join(PERFILES_DIR, base), entry.getData());
    restauradas++;
  }
  return restauradas;
}

router.post('/restaurar', auth, isAdmin, uploadBackup.single('archivo'), (req, res) => {
  if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
    return res.status(400).json({ error: 'No se ha recibido ningún fichero' });
  }

  try {
    let dbBuffer = req.file.buffer;
    let imagenesRestauradas = 0;

    if (esZip(req.file.buffer)) {
      const zip = new AdmZip(req.file.buffer);
      const entradaDb =
        zip.getEntry(DB_ENTRY) ||
        zip.getEntries().find((e) => !e.isDirectory && e.entryName.toLowerCase().endsWith('.db'));
      if (!entradaDb) {
        return res.status(400).json({
          error: 'El ZIP no contiene ninguna base de datos (.db)',
        });
      }
      dbBuffer = entradaDb.getData();
      imagenesRestauradas = restaurarImagenesDeZip(zip);
    }

    const { copiaPrevia } = reemplazarBaseDatos(dbBuffer);
    // Garantizamos que el catálogo y el admin existan tras la restauración.
    poblarDatosIniciales();
    seedAdmin();
    return res.json({
      mensaje: 'Base de datos restaurada correctamente',
      copiaPrevia,
      imagenes_restauradas: imagenesRestauradas,
    });
  } catch (err) {
    console.error(err);
    return res.status(400).json({ error: err.message || 'Error al restaurar la copia' });
  }
});

module.exports = router;
