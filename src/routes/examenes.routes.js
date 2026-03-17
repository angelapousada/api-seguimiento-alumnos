const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const examenesController = require('../controllers/examenes.controller');

router.get('/', auth, examenesController.listar);
router.get('/:id', auth, examenesController.obtener);
router.post('/', auth, examenesController.crear);
router.put('/:id', auth, examenesController.actualizar);
router.delete('/:id', auth, examenesController.eliminar);

router.get('/:id_examen/asistencias', auth, examenesController.listarAsistencias);
router.post('/:id_examen/asistencias', auth, examenesController.guardarAsistencias);

module.exports = router;