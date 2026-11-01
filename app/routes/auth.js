const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { requireLogin } = require('../middleware/auth');
const { asyncHandler, safeRedirect, EMAIL_RE } = require('../utils/helpers');

const router = express.Router();

router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('auth/register', { title: 'Register', form: {}, errors: [] });
});

router.post('/register', asyncHandler(async (req, res, next) => {
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const { password = '', confirm = '' } = req.body;

  const errors = [];
  if (name.length < 2 || name.length > 100) errors.push('Name must be between 2 and 100 characters.');
  if (!EMAIL_RE.test(email)) errors.push('Please enter a valid email address.');
  if (password.length < 8 || !/\d/.test(password) || !/[A-Za-z]/.test(password)) {
    errors.push('Password must be at least 8 characters and contain letters and numbers.');
  }
  if (password !== confirm) errors.push('Passwords do not match.');

  if (!errors.length) {
    const [[existing]] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) errors.push('An account with this email already exists.');
  }
  if (errors.length) {
    return res.status(422).render('auth/register', { title: 'Register', form: { name, email }, errors });
  }

  const hash = await bcrypt.hash(password, 10);
  const [result] = await pool.query(
    'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
    [name, email, hash]
  );
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.userId = result.insertId;
    req.flash('success', `Welcome, ${name}! Your account has been created.`);
    res.redirect('/books');
  });
}));

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('auth/login', { title: 'Login', form: {}, next: req.query.next || '', errors: [] });
});

router.post('/login', asyncHandler(async (req, res, next) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const redirectTo = safeRedirect(req.body.next, '/');

  const [[user]] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  const valid = user && (await bcrypt.compare(password, user.password_hash));

  if (!valid || !user.is_active) {
    const message = valid ? 'Your account has been deactivated. Contact the librarian.' : 'Invalid email or password.';
    return res.status(401).render('auth/login', { title: 'Login', form: { email }, next: redirectTo, errors: [message] });
  }

  // New session id on login prevents session fixation.
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.userId = user.id;
    req.flash('success', `Welcome back, ${user.name}.`);
    res.redirect(user.role === 'admin' && redirectTo === '/' ? '/admin' : redirectTo);
  });
}));

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('lms.sid');
    res.redirect('/login');
  });
});

router.get('/profile', requireLogin, asyncHandler(async (req, res) => {
  const [[stats]] = await pool.query(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(status = 'issued'), 0) AS active,
            COALESCE(SUM(fine_amount), 0) AS fines
     FROM loans WHERE user_id = ?`,
    [req.user.id]
  );
  res.render('auth/profile', { title: 'My Profile', stats, errors: [] });
}));

router.post('/profile', requireLogin, asyncHandler(async (req, res) => {
  const name = (req.body.name || '').trim();
  if (name.length < 2 || name.length > 100) {
    req.flash('error', 'Name must be between 2 and 100 characters.');
  } else {
    await pool.query('UPDATE users SET name = ? WHERE id = ?', [name, req.user.id]);
    req.flash('success', 'Profile updated.');
  }
  res.redirect('/profile');
}));

router.post('/profile/password', requireLogin, asyncHandler(async (req, res) => {
  const { current = '', password = '', confirm = '' } = req.body;
  const [[user]] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);

  if (!(await bcrypt.compare(current, user.password_hash))) {
    req.flash('error', 'Current password is incorrect.');
  } else if (password.length < 8 || !/\d/.test(password) || !/[A-Za-z]/.test(password)) {
    req.flash('error', 'New password must be at least 8 characters and contain letters and numbers.');
  } else if (password !== confirm) {
    req.flash('error', 'New passwords do not match.');
  } else {
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(password, 10), req.user.id]);
    req.flash('success', 'Password changed successfully.');
  }
  res.redirect('/profile');
}));

module.exports = router;
