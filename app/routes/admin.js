const express = require('express');
const { pool } = require('../config/db');
const { requireAdmin } = require('../middleware/auth');
const { asyncHandler, parseId, FINE_PER_DAY } = require('../utils/helpers');

const router = express.Router();

router.use(requireAdmin);

router.get('/', asyncHandler(async (req, res) => {
  const [[stats]] = await pool.query(`
    SELECT (SELECT COUNT(*) FROM books)                                                  AS titles,
           (SELECT COALESCE(SUM(total_copies), 0) FROM books)                            AS copies,
           (SELECT COUNT(*) FROM users WHERE role = 'member')                            AS members,
           (SELECT COUNT(*) FROM loans WHERE status = 'issued')                          AS active_loans,
           (SELECT COUNT(*) FROM loans WHERE status = 'issued' AND due_date < NOW())     AS overdue,
           (SELECT COALESCE(SUM(fine_amount), 0) FROM loans)                             AS fines`);
  const [popular] = await pool.query(`
    SELECT b.id, b.title, b.author, COUNT(l.id) AS times_borrowed
    FROM books b JOIN loans l ON l.book_id = b.id
    GROUP BY b.id ORDER BY times_borrowed DESC, b.title LIMIT 5`);
  const [byCategory] = await pool.query(`
    SELECT COALESCE(c.name, 'Uncategorised') AS name, COUNT(b.id) AS books
    FROM books b LEFT JOIN categories c ON c.id = b.category_id
    GROUP BY c.name ORDER BY books DESC`);
  const [overdue] = await pool.query(`
    SELECT l.id, l.due_date, b.title, u.name AS member, DATEDIFF(NOW(), l.due_date) AS days_late
    FROM loans l JOIN books b ON b.id = l.book_id JOIN users u ON u.id = l.user_id
    WHERE l.status = 'issued' AND l.due_date < NOW() ORDER BY l.due_date LIMIT 10`);
  res.render('admin/dashboard', { title: 'Admin Dashboard', stats, popular, byCategory, overdue });
}));

router.get('/loans', asyncHandler(async (req, res) => {
  const status = ['active', 'overdue', 'returned'].includes(req.query.status) ? req.query.status : 'all';
  const filters = {
    all: '',
    active: "WHERE l.status = 'issued'",
    overdue: "WHERE l.status = 'issued' AND l.due_date < NOW()",
    returned: "WHERE l.status = 'returned'",
  };
  const [loans] = await pool.query(
    `SELECT l.*, b.title, u.name AS member, u.email,
            (l.status = 'issued' AND l.due_date < NOW()) AS overdue,
            GREATEST(DATEDIFF(NOW(), l.due_date), 0) * ? AS accrued_fine
     FROM loans l JOIN books b ON b.id = l.book_id JOIN users u ON u.id = l.user_id
     ${filters[status]} ORDER BY l.issued_at DESC LIMIT 200`,
    [FINE_PER_DAY]
  );
  res.render('admin/loans', { title: 'All Loans', loans, status });
}));

router.get('/users', asyncHandler(async (req, res) => {
  const [users] = await pool.query(`
    SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at,
           COALESCE(SUM(l.status = 'issued'), 0) AS active_loans
    FROM users u LEFT JOIN loans l ON l.user_id = u.id
    GROUP BY u.id ORDER BY u.created_at DESC`);
  res.render('admin/users', { title: 'Manage Users', users });
}));

router.post('/users/:id/role', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const role = req.body.role === 'admin' ? 'admin' : 'member';
  if (id === req.user.id) {
    req.flash('error', 'You cannot change your own role.');
  } else {
    await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, id]);
    req.flash('success', `User role changed to ${role}.`);
  }
  res.redirect('/admin/users');
}));

router.post('/users/:id/toggle', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (id === req.user.id) {
    req.flash('error', 'You cannot deactivate your own account.');
  } else {
    await pool.query('UPDATE users SET is_active = NOT is_active WHERE id = ?', [id]);
    req.flash('success', 'User status updated.');
  }
  res.redirect('/admin/users');
}));

module.exports = router;
