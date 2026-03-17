const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const sesionesController = require('../controllers/sesiones.controller');

router.get('/', auth, sesionesController.listar);
router.get('/:id', auth, sesionesController.obtener);
router.post('/', auth, sesionesController.crear);
router.put('/:id', auth, sesionesController.actualizar);
router.delete('/:id', auth, sesionesController.eliminar);

router.get('/:id_sesion/asistencias', auth, sesionesController.listarAsistencias);
router.post('/:id_sesion/asistencias', auth, sesionesController.guardarAsistencias);

router.get('/:id_sesion/valoraciones', auth, sesionesController.listarValoraciones);
router.post('/:id_sesion/valoraciones', auth, sesionesController.guardarValoraciones);

router.get('/:id_sesion/entregas', auth, sesionesController.listarEntregas);
router.post('/:id_sesion/entregas', auth, sesionesController.guardarEntregas);

module.exports = router;