const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');

admin.initializeApp();

const db = admin.firestore();
const app = express();

app.use(cors({ origin: true }));
app.use(express.json());

// Middleware para verificar autenticación
const authenticate = async (req, res, next) => {
  if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  try {
    const idToken = req.headers.authorization.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
};

// Middleware para verificar admin
const requireAdmin = async (req, res, next) => {
  try {
    const user = await admin.auth().getUser(req.user.uid);
    if (user.customClaims && user.customClaims.admin) {
      next();
    } else {
      return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador.' });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Error verificando permisos' });
  }
};

// ============ AUTH ============
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
    }

    // Buscar usuario por email en Firestore
    const usuariosRef = db.collection('usuarios');
    const snapshot = await usuariosRef.where('email', '==', email).limit(1).get();

    if (snapshot.empty) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    let userData;
    snapshot.forEach(doc => {
      userData = { id: doc.id, ...doc.data() };
    });

    // Verificar contraseña con bcrypt
    const bcrypt = require('bcrypt');
    const validPassword = await bcrypt.compare(password, userData.contrasena);

    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Generar token personalizado
    const token = await admin.auth().createCustomToken(userData.id, {
      rol: userData.rol,
      email: userData.email
    });

    res.json({
      token,
      usuario: {
        id: userData.id,
        nombre: userData.nombre,
        email: userData.email,
        usuario: userData.usuario,
        rol: userData.rol
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ============ PROFESORES ============
app.get('/api/profesores', authenticate, async (req, res) => {
  try {
    const snapshot = await db.collection('usuarios').get();
    const profesores = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      profesores.push({
        id: doc.id,
        nombre: data.nombre,
        correo: data.email,
        usuario: data.usuario,
        rol: data.rol
      });
    });
    res.json(profesores);
  } catch (error) {
    console.error('Error listar profesores:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/profesores', authenticate, requireAdmin, async (req, res) => {
  try {
    const { nombre, correo, usuario, contrasena } = req.body;

    // Verificar si el usuario ya existe
    const existing = await db.collection('usuarios')
      .where('usuario', '==', usuario)
      .where('email', '==', correo)
      .get();

    if (!existing.empty) {
      return res.status(400).json({ error: 'El usuario o correo ya existe' });
    }

    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash(contrasena, 10);

    // Crear usuario en Firebase Auth
    const userRecord = await admin.auth().createUser({
      email: correo,
      password: contrasena,
      displayName: nombre
    });

    // Guardar en Firestore
    const docRef = await db.collection('usuarios').add({
      nombre,
      email: correo,
      usuario,
      contrasena: hashedPassword,
      rol: 'profesor',
      firebaseUid: userRecord.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(201).json({ message: 'Profesor creado correctamente', id: docRef.id });
  } catch (error) {
    console.error('Error crear profesor:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.delete('/api/profesores/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener el usuario para eliminarlo de Firebase Auth
    const doc = await db.collection('usuarios').doc(id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Profesor no encontrado' });
    }

    const userData = doc.data();
    if (userData.firebaseUid) {
      await admin.auth().deleteUser(userData.firebaseUid);
    }

    await db.collection('usuarios').doc(id).delete();
    res.json({ message: 'Profesor eliminado correctamente' });
  } catch (error) {
    console.error('Error borrar profesor:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ============ ASIGNATURAS ============
app.get('/api/asignaturas', authenticate, async (req, res) => {
  try {
    const snapshot = await db.collection('asignaturas')
      .orderBy('createdAt', 'desc')
      .get();
    const asignaturas = [];
    snapshot.forEach(doc => {
      asignaturas.push({ id: doc.id, ...doc.data() });
    });
    res.json(asignaturas);
  } catch (error) {
    console.error('Error listar asignaturas:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/asignaturas', authenticate, async (req, res) => {
  try {
    const { nombre, curso, titulacion, fecha_inicio, fecha_fin } = req.body;

    const docRef = await db.collection('asignaturas').add({
      nombre,
      curso,
      titulacion,
      fecha_inicio: fecha_inicio || null,
      fecha_fin: fecha_fin || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(201).json({ message: 'Asignatura creada correctamente', id: docRef.id });
  } catch (error) {
    console.error('Error crear asignatura:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.delete('/api/asignaturas/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('asignaturas').doc(id).delete();
    res.json({ message: 'Asignatura eliminada correctamente' });
  } catch (error) {
    console.error('Error eliminar asignatura:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ============ GRUPOS ============
app.get('/api/grupos', authenticate, async (req, res) => {
  try {
    const { id_asignatura, tipo } = req.query;
    let query = db.collection('grupos');

    if (id_asignatura) {
      query = query.where('id_asignatura', '==', id_asignatura);
    }
    if (tipo) {
      query = query.where('tipo', '==', tipo);
    }

    const snapshot = await query.orderBy('nombre').get();
    const grupos = [];
    snapshot.forEach(doc => {
      grupos.push({ id: doc.id, ...doc.data() });
    });
    res.json(grupos);
  } catch (error) {
    console.error('Error listar grupos:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/grupos', authenticate, async (req, res) => {
  try {
    const { nombre, tipo, aula, id_asignatura } = req.body;

    const docRef = await db.collection('grupos').add({
      nombre,
      tipo,
      aula: aula || null,
      id_asignatura,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(201).json({ message: 'Grupo creado correctamente', id: docRef.id });
  } catch (error) {
    console.error('Error crear grupo:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.delete('/api/grupos/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('grupos').doc(id).delete();
    res.json({ message: 'Grupo eliminado correctamente' });
  } catch (error) {
    console.error('Error eliminar grupo:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ============ SESIONES ============
app.get('/api/sesiones', authenticate, async (req, res) => {
  try {
    const { id_grupo, id_asignatura } = req.query;
    let query = db.collection('sesiones');

    if (id_grupo) {
      query = query.where('id_grupo', '==', id_grupo);
    }

    const snapshot = await query.orderBy('fecha', 'desc').get();
    const sesiones = [];
    snapshot.forEach(doc => {
      sesiones.push({ id: doc.id, ...doc.data() });
    });

    // Si hay filtro por asignatura, filtrar también por los grupos de esa asignatura
    if (id_asignatura) {
      const gruposSnapshot = await db.collection('grupos')
        .where('id_asignatura', '==', id_asignatura)
        .get();
      const gruposIds = gruposSnapshot.docs.map(d => d.id);
      const filtered = sesiones.filter(s => gruposIds.includes(s.id_grupo));
      res.json(filtered);
    } else {
      res.json(sesiones);
    }
  } catch (error) {
    console.error('Error listar sesiones:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.get('/api/sesiones/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await db.collection('sesiones').doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Sesión no encontrada' });
    }

    res.json({ id: doc.id, ...doc.data() });
  } catch (error) {
    console.error('Error obtener sesión:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/sesiones', authenticate, async (req, res) => {
  try {
    const { fecha, hora_inicio, hora_fin, aula, id_grupo } = req.body;

    const docRef = await db.collection('sesiones').add({
      fecha,
      hora_inicio: hora_inicio || null,
      hora_fin: hora_fin || null,
      aula: aula || null,
      id_grupo,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(201).json({ message: 'Sesión creada correctamente', id: docRef.id });
  } catch (error) {
    console.error('Error crear sesión:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ============ ASISTENCIAS SESIÓN ============
app.get('/api/sesiones/:idSesion/asistencias', authenticate, async (req, res) => {
  try {
    const { idSesion } = req.params;
    const snapshot = await db.collection('asistencias')
      .where('id_sesion', '==', idSesion)
      .get();

    const ayudas = [];
    snapshot.forEach(doc => {
      ayudas.push({ id: doc.id, ...doc.data() });
    });
    res.json(ayudas);
  } catch (error) {
    console.error('Error listar asistencias:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/sesiones/:idSesion/asistencias', authenticate, async (req, res) => {
  try {
    const { idSesion } = req.params;
    const { asistencialist } = req.body;

    const batch = db.batch();

    for (const a of asistencialist) {
      const ref = db.collection('asistencias').doc();
      batch.set(ref, {
        asistencia: a.asistencia,
        posicion: a.posicion || 0,
        comentario: a.comentario || null,
        otro_grupo: a.otro_grupo || 'No',
        id_sesion: idSesion,
        id_estudiante_asignatura_grupo: a.id_estudiante_asignatura_grupo
      });
    }

    await batch.commit();
    res.json({ message: 'Asistencias guardadas correctamente' });
  } catch (error) {
    console.error('Error guardar asistencias:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ============ EXÁMENES ============
app.get('/api/examenes', authenticate, async (req, res) => {
  try {
    const { id_grupo, id_asignatura } = req.query;
    let query = db.collection('examenes');

    if (id_grupo) {
      query = query.where('id_grupo', '==', id_grupo);
    }

    const snapshot = await query.orderBy('fecha', 'desc').get();
    const examenes = [];
    snapshot.forEach(doc => {
      examenes.push({ id: doc.id, ...doc.data() });
    });

    if (id_asignatura) {
      const gruposSnapshot = await db.collection('grupos')
        .where('id_asignatura', '==', id_asignatura)
        .get();
      const gruposIds = gruposSnapshot.docs.map(d => d.id);
      const filtered = examenes.filter(e => gruposIds.includes(e.id_grupo));
      res.json(filtered);
    } else {
      res.json(examenes);
    }
  } catch (error) {
    console.error('Error listar exámenes:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/examenes', authenticate, async (req, res) => {
  try {
    const { fecha, nombre, hora_inicio, aulas, id_grupo } = req.body;

    const docRef = await db.collection('examenes').add({
      fecha,
      nombre,
      hora_inicio: hora_inicio || null,
      aulas: aulas || null,
      id_grupo,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(201).json({ message: 'Examen creado correctamente', id: docRef.id });
  } catch (error) {
    console.error('Error crear examen:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ============ ASISTENCIAS EXAMEN ============
app.get('/api/examenes/:idExamen/asistencias', authenticate, async (req, res) => {
  try {
    const { idExamen } = req.params;
    const snapshot = await db.collection('asistencias_examen')
      .where('id_examen', '==', idExamen)
      .get();

    const ayudas = [];
    snapshot.forEach(doc => {
      ayudas.push({ id: doc.id, ...doc.data() });
    });
    res.json(ayudas);
  } catch (error) {
    console.error('Error listar asistencia examen:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/examenes/:idExamen/asistencias', authenticate, async (req, res) => {
  try {
    const { idExamen } = req.params;
    const { asistencialist } = req.body;

    const batch = db.batch();

    for (const a of asistencialist) {
      const ref = db.collection('asistencias_examen').doc();
      batch.set(ref, {
        asistencia: a.asistencia,
        comentario: a.comentario || null,
        id_examen: idExamen,
        id_estudiante_asignatura_grupo: a.id_estudiante_asignatura_grupo
      });
    }

    await batch.commit();
    res.json({ message: 'Asistencias guardadas correctamente' });
  } catch (error) {
    console.error('Error guardar asistencia examen:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Exportar la función
exports.api = functions.https.onRequest(app);
