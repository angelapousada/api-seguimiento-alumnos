const admin = require('firebase-admin');
const bcrypt = require('bcrypt');

const serviceAccount = require('../firebase-config/service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function createAdminUser() {
  const email = 'admin@universidad.es';
  const password = 'admin123';
  const nombre = 'Administrador';
  const usuario = 'admin';

  try {
    console.log('Creando usuario admin...');

    // Crear usuario en Firebase Auth
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: nombre
    });

    console.log('Usuario creado en Firebase Auth:', userRecord.uid);

    // Hashear la contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Guardar en Firestore
    const db = admin.firestore();
    await db.collection('usuarios').add({
      nombre,
      email,
      usuario,
      contrasena: hashedPassword,
      rol: 'admin',
      firebaseUid: userRecord.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('Usuario admin creado correctamente!');
    console.log('Email:', email);
    console.log('Contraseña:', password);

    process.exit(0);
  } catch (error) {
    console.error('Error al crear usuario admin:', error);
    process.exit(1);
  }
}

createAdminUser();
