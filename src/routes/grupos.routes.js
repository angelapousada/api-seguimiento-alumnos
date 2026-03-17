const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const gruposController = require('../controllers/grupos.controller');

router.get('/', auth, gruposController.listar);
router.get('/:id', auth, gruposController.obtener);
router.post('/', auth, gruposController.crear);
router.put('/:id', auth, gruposController.actualizar);
router.delete('/:id', auth, gruposController.eliminar);

router.get('/:id_grupo/estudiantes', auth, gruposController.listarEstudiantes);
router.post('/:id_grupo/estudiantes', auth, gruposController.agregarEstudiante);
router.put('/:id_grupo_origen/mover/:id_grupo_destino', auth, gruposController.moverEstudiante);

module.exports = router;