function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/auth/login');
}

function ensureAdmin(req, res, next) {
  console.log('[ensureAdmin] isAuthenticated:', req.isAuthenticated(), 'user:', req.user ? { id: req.user.id, role: req.user.role } : null);
  if (req.isAuthenticated() && req.user.role === 'admin') {
    return next();
  }
  res.status(403).send('Forbidden');
}

module.exports = { ensureAuthenticated, ensureAdmin };
