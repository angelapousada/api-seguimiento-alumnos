const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
require('dotenv').config();

const app = express();

// Seguridad
app.use(helmet());
app.use(cors({ origin: '*' })); // Ajustar origen en producción

// Rate limit solo en login
const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 10,
  message: { error: 'Demasiados intentos, espera un momento.' }
});

// Middlewares generales
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuración de multer para archivos
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Rutas
app.use('/api/auth', loginLimiter, require('./routes/auth.routes'));
app.use('/api/profesores', require('./routes/profesores.routes'));
app.use('/api/asignaturas', require('./routes/asignaturas.routes'));
app.use('/api/estudiantes', require('./routes/estudiantes.routes'));
app.use('/api/grupos', require('./routes/grupos.routes'));
app.use('/api/sesiones', require('./routes/sesiones.routes'));
app.use('/api/examenes', require('./routes/examenes.routes'));

app.listen(process.env.PORT, () => {
  console.log(`API corriendo en puerto ${process.env.PORT}`);
});