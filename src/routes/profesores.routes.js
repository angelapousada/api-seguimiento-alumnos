const router = require('express').Router();
const auth = require('../middlewares/auth');
const isAdmin = require('../middlewares/isAdmin');
const { body } = require('express-validator');
const validate = require('../middlewares/validate');
const profesoresController = require('../controllers/profesores.controller');

router.post('/',
  auth,
  isAdmin,
  [
    body('nombre').notEmpty().withMessage('El nombre es obligatorio'),
    body('correo').isEmail().withMessage('Correo inválido'),
    body('usuario').notEmpty().withMessage('El usuario es obligatorio'),
    body('contrasena').isLength({ min: 8 }).withMessage('Mínimo 8 caracteres'),
  ],
  validate,
  profesoresController.crear
);

router.delete('/:id', auth, isAdmin, profesoresController.borrar);

router.get('/', auth, profesoresController.listar);

module.exports = router;