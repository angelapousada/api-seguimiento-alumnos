const express = require('express');
const router = express.Router();
const multer = require('multer');
const auth = require('../middlewares/auth');
const estudiantesController = require('../controllers/estudiantes.controller');

const storage = multer.memoryStorage();
const upload = multer({ storage });

router.get('/', auth, estudiantesController.listar);
router.get('/buscar', auth, estudiantesController.buscar);
router.get('/:id', auth, estudiantesController.obtener);

router.post('/cargar-excel', auth, upload.single('archivo'), estudiantesController.cargarExcel);
router.post('/cargar-imagenes', auth, upload.array('imagenes', 100), estudiantesController.cargarImagenes);

router.get('/grupo/:id_grupo/estadisticas', auth, estudiantesController.obtenerEstadisticas);

module.exports = router;