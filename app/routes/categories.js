const express = require('express');
const { pool } = require('../config/db');
const { requireAdmin } = require('../middleware/auth');
const { asyncHandler, parseId } = require('../utils/helpers');

const router = express.Router();

router.use(requireAdmin);

router.get('/', asyncHandler(async (req, res) => {
  const [categories] = await pool.query(
    `SELECT c.id, c.name, c.description, COUNT(b.id) AS book_count
     FROM categories c LEFT JOIN books b ON b.category_id = c.id
     GROUP BY c.id ORDER BY c.name`
  );
  res.render('categories/list', { title: 'Categories', categories });
}));

router.post('/', asyncHandler(async (req, res) => {
  const name = (req.body.name || '').trim();
  const description = (req.body.description || '').trim() || null;
  if (!name || name.length > 80) {
    req.flash('error', 'Category name is required (max 80 characters).');
    return res.redirect('/categories');
  }
  try {
    await pool.query('INSERT INTO categories (name, description) VALUES (?, ?)', [name, description]);
    req.flash('success', `Category "${name}" created.`);
  } catch (err) {
    if (err.code !== 'ER_DUP_ENTRY') throw err;
    req.flash('error', `Category "${name}" already exists.`);
  }
  res.redirect('/categories');
}));

router.post('/:id/delete', asyncHandler(async (req, res) => {
  const [result] = await pool.query('DELETE FROM categories WHERE id = ?', [parseId(req.params.id)]);
  req.flash(result.affectedRows ? 'success' : 'error',
    result.affectedRows ? 'Category deleted; its books are now uncategorised.' : 'Category not found.');
  res.redirect('/categories');
}));

module.exports = router;
