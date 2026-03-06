const router = require('express').Router();
const auth = require('../middlewares/auth');
const isAdmin = require('../middlewares/isAdmin');
const { body } = require('express-validator');
const validate = require('../middlewares/validate');

// Solo admin puede crear o borrar profesores
router.post('/',
  auth,
  isAdmin,
  [
    body('nombre').notEmpty().withMessage('El nombre es obligatorio'),
    body('correo').isEmail().withMessage('Correo inválido'),
    body('usuario').notEmpty(),
    body('contrasena').isLength({ min: 8 }).withMessage('Mínimo 8 caracteres'),
  ],
  validate,
  require('../controllers/profesores.controller').crear
);

router.delete('/:id', auth, isAdmin,
  require('../controllers/profesores.controller').borrar
);

// Cualquier profesor autenticado puede ver la lista
router.get('/', auth, require('../controllers/profesores.controller').listar);

module.exports = router;