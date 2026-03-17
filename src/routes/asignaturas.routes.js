const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const isAdmin = require('../middlewares/isAdmin');
const { body } = require('express-validator');
const validate = require('../middlewares/validate');
const asignaturasController = require('../controllers/asignaturas.controller');

router.get('/', auth, asignaturasController.listar);
router.get('/:id', auth, asignaturasController.obtener);

router.post('/',
  auth,
  isAdmin,
  [
    body('nombre').notEmpty().withMessage('El nombre es obligatorio'),
    body('curso').notEmpty().withMessage('El curso es obligatorio'),
    body('titulacion').notEmpty().withMessage('La titulación es obligatoria'),
  ],
  validate,
  asignaturasController.crear
);

router.put('/:id', auth, isAdmin, asignaturasController.actualizar);
router.delete('/:id', auth, isAdmin, asignaturasController.eliminar);

router.get('/:id_asignatura/estudiantes', auth, asignaturasController.listarEstudiantes);

router.delete('/admin/limpiar', auth, isAdmin, asignaturasController.limpiarBaseDatos);

module.exports = router;