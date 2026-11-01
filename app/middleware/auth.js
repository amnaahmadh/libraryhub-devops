const { pool } = require('../config/db');

// Reload the user on every request so role changes and deactivation take effect immediately.
async function attachUser(req, res, next) {
  res.locals.currentUser = null;
  if (!req.session || !req.session.userId) return next();
  try {
    const [[user]] = await pool.query(
      'SELECT id, name, email, role, is_active FROM users WHERE id = ?',
      [req.session.userId]
    );
    if (!user || !user.is_active) {
      delete req.session.userId;
    } else {
      req.user = user;
      res.locals.currentUser = user;
    }
    next();
  } catch (err) {
    next(err);
  }
}

function requireLogin(req, res, next) {
  if (req.user) return next();
  req.flash('error', 'Please log in to continue.');
  res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
}

function requireAdmin(req, res, next) {
  if (!req.user) return requireLogin(req, res, next);
  if (req.user.role === 'admin') return next();
  res.status(403).render('error', { title: 'Forbidden', status: 403, message: 'Administrator access is required.' });
}

module.exports = { attachUser, requireLogin, requireAdmin };
