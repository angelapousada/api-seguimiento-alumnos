require('dotenv').config();
const fs = require('fs');
const https = require('https');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

// Inicializar DB (crea tablas y datos iniciales al importar)
require('./config/db');

const authRoutes = require('./routes/auth.routes');
const usuariosRoutes = require('./routes/usuarios.routes');
const asignaturasRoutes = require('./routes/asignaturas.routes');
const gruposRoutes = require('./routes/grupos.routes');
const sesionesRoutes = require('./routes/sesiones.routes');
const examenesRoutes = require('./routes/examenes.routes');
const estudiantesRoutes = require('./routes/estudiantes.routes');

const app = express();

// ─── Middlewares globales ────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// ─── Rutas ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/asignaturas', asignaturasRoutes);
app.use('/api/grupos', gruposRoutes);
app.use('/api/sesiones', sesionesRoutes);
app.use('/api/examenes', examenesRoutes);
app.use('/api/estudiantes', estudiantesRoutes);

// ─── Ruta raíz de comprobación ───────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ mensaje: 'API Seguimiento Alumnos funcionando correctamente' });
});

// ─── Middleware de error genérico ────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack || err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Error interno del servidor',
  });
});

// ─── Arrancar servidor HTTPS ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const SSL_KEY = process.env.SSL_KEY;
const SSL_CERT = process.env.SSL_CERT;

if (SSL_KEY && SSL_CERT) {
  const sslOptions = {
    key: fs.readFileSync(SSL_KEY),
    cert: fs.readFileSync(SSL_CERT),
  };
  https.createServer(sslOptions, app).listen(PORT, () => {
    console.log(`Servidor HTTPS escuchando en https://localhost:${PORT}`);
  });
} else {
  // Fallback HTTP para entornos sin certificado configurado
  app.listen(PORT, () => {
    console.log(`Servidor HTTP escuchando en http://localhost:${PORT}`);
  });
}

module.exports = app;
