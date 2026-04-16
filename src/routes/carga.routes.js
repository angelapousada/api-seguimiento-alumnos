const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const db = require('../config/db');
const auth = require('../middlewares/auth');

const router = express.Router();

const upload = multer({ dest: 'uploads/' });

router.post('/asignaturas', auth, upload.single('archivo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Archivo no proporcionado' });
  }

  try {
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const datos = xlsx.utils.sheet_to_json(sheet);

    if (datos.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'El archivo está vacío' });
    }

    const resultado = {
      creados: 0,
      actualizados: 0,
      errores: []
    };

    const insertar = db.transaction(() => {
      const cols = Object.keys(datos[0]);
      const getCol = (row, names) => {
        for (const n of names) {
          if (cols.includes(n)) return row[n];
        }
        return null;
      };

      for (let i = 0; i < datos.length; i++) {
        try {
          const row = datos[i];
          const nombre = getCol(row, ['Nombre', 'nombre', 'Asignatura', 'asignatura', 'NOMBRE']);
          const dni = getCol(row, ['DNI', 'dni', 'NIF']);
          const nombreCompleto = getCol(row, ['Nombre completo', 'nombre_completo', 'Alumno', 'NOMBRE COMPLEO']);
          const correo = getCol(row, ['Correo', 'correo', 'EMAIL', 'email']);
          const movilidad = getCol(row, ['Movilidad', 'movilidad', 'MOVILIDAD']);
          const convocatorias = parseInt(getCol(row, ['Convocatorias', 'convocatorias', 'CONVOCATORIAS']) || '0');
          const matriculas = parseInt(getCol(row, ['Matrículas', 'matriculas', 'MATRÍCULAS', 'MATRICULAS']) || '0');
          const matricula = getCol(row, ['Matrícula', 'matricula', 'MATRÍCULA', 'MATRICULA']) === 'Si' ? 'Si' : 'No';

          if (!dni && !nombreCompleto) {
            resultado.errores.push(`Fila ${i + 2}: Falta DNI o nombre`);
            continue;
          }

          let estudiante = db.prepare('SELECT id FROM estudiantes WHERE dni = ? OR (dni IS NULL AND nombre = ?)').get(dni || null, nombreCompleto || null);

          if (!estudiante) {
            const r = db.prepare(`
              INSERT INTO estudiantes (dni, nombre, correo, movilidad)
              VALUES (?, ?, ?, ?)
            `).run(dni || null, nombreCompleto || '', correo || null, movilidad === 'Si' ? 'Si' : 'No');
            estudiante = { id: r.lastInsertRowid };
            resultado.creados++;
          }

        } catch (err) {
          resultado.errores.push(`Fila ${i + 2}: ${err.message}`);
        }
      }
    });

    insertar();
    fs.unlinkSync(req.file.path);

    return res.json({
      mensaje: 'Archivo procesado correctamente',
      resultado
    });
  } catch (err) {
    console.error(err);
    if (req.file && req.file.path) fs.unlinkSync(req.file.path);
    return res.status(500).json({ error: 'Error al procesar el archivo' });
  }
});

router.post('/asignaturas-simple', auth, upload.single('archivo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Archivo no proporcionado' });
  }

  try {
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const datos = xlsx.utils.sheet_to_json(sheet);

    if (datos.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'El archivo está vacío' });
    }

    const cols = Object.keys(datos[0]);
    const getCol = (row, names) => {
      for (const n of names) {
        if (cols.includes(n)) return row[n];
      }
      return null;
    };

    const row = datos[0];
    const nombre = getCol(row, ['Nombre', 'nombre', 'Asignatura', 'NOMBRE']);
    const curso = getCol(row, ['Curso', 'curso', 'CURSO']);
    const titulacion = getCol(row, ['Titulación', 'titulacion', 'TITULACIÓN', 'Titulacion']);

    if (!nombre) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'No se encontró el nombre de la asignatura' });
    }

    const estudiantes = [];
    for (let i = 0; i < datos.length; i++) {
      const r = datos[i];
      const dni = getCol(r, ['DNI', 'dni', 'NIF'])?.toString().trim();
      const nombreCompleto = getCol(r, ['Nombre completo', 'nombre_completo', 'Alumno', 'NOMBRE COMPLEO']);
      const correo = getCol(r, ['Correo', 'correo', 'EMAIL', 'email']);
      const movilidad = getCol(r, ['Movilidad', 'movilidad']) === 'Si' ? 'Si' : 'No';

      if (dni || nombreCompleto) {
        estudiantes.push({
          dni: dni || null,
          nombre: nombreCompleto || 'Sin nombre',
          correo: correo || null,
          movilidad
        });
      }
    }

    fs.unlinkSync(req.file.path);

    return res.json({
      nombre,
      curso: curso || '',
      titulacion: titulacion || '',
      estudiantes
    });
  } catch (err) {
    console.error(err);
    if (req.file && req.file.path) fs.unlinkSync(req.file.path);
    return res.status(500).json({ error: 'Error al procesar el archivo' });
  }
});

router.post('/imagenes', auth, upload.single('archivo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Archivo no proporcionado' });
  }

  try {
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const datos = xlsx.utils.sheet_to_json(sheet);

    const cols = Object.keys(datos[0]);
    const getCol = (row, names) => {
      for (const n of names) {
        if (cols.includes(n)) return row[n];
      }
      return null;
    };

    let actualizados = 0;
    const actualizar = db.transaction(() => {
      for (const row of datos) {
        const dni = getCol(row, ['DNI', 'dni'])?.toString().trim();
        const rutaImagen = getCol(row, ['Ruta', 'ruta', 'Imagen', 'FOTO']);

        if (dni) {
          const result = db.prepare(`
            UPDATE estudiantes SET ruta_imagen = ? WHERE dni = ?
          `).run(rutaImagen || 'Si', dni);
          if (result.changes > 0) actualizados++;
        }
      }
    });

    actualizar();
    fs.unlinkSync(req.file.path);

    return res.json({
      mensaje: 'Imágenes actualizadas correctamente',
      actualizados
    });
  } catch (err) {
    console.error(err);
    if (req.file && req.file.path) fs.unlinkSync(req.file.path);
    return res.status(500).json({ error: 'Error al procesar el archivo' });
  }
});

module.exports = router;
