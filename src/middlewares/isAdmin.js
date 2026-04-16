function isAdmin(req, res, next) {
  if (req.user && req.user.rol === 0) {
    return next();
  }
  return res.status(403).json({ error: 'Acceso restringido a administradores' });
}

module.exports = isAdmin;
