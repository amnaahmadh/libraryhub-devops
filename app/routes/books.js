const express = require('express');
const { pool } = require('../config/db');
const { requireAdmin } = require('../middleware/auth');
const { asyncHandler, httpError, parseId } = require('../utils/helpers');

const router = express.Router();
const PAGE_SIZE = 9;

function validateBook(body) {
  const book = {
    title: (body.title || '').trim(),
    author: (body.author || '').trim(),
    isbn: (body.isbn || '').replace(/[\s-]/g, ''),
    category_id: parseId(body.category_id),
    publisher: (body.publisher || '').trim() || null,
    published_year: body.published_year ? Number(body.published_year) : null,
    total_copies: Number(body.total_copies),
    description: (body.description || '').trim() || null,
  };
  const errors = [];
  if (!book.title || book.title.length > 200) errors.push('Title is required (max 200 characters).');
  if (!book.author || book.author.length > 150) errors.push('Author is required (max 150 characters).');
  if (!/^(\d{9}[\dX]|\d{13})$/i.test(book.isbn)) errors.push('ISBN must be a valid 10 or 13 digit ISBN.');
  const year = new Date().getFullYear();
  if (book.published_year !== null && (!Number.isInteger(book.published_year) || book.published_year < 1450 || book.published_year > year)) {
    errors.push(`Published year must be between 1450 and ${year}.`);
  }
  if (!Number.isInteger(book.total_copies) || book.total_copies < 1 || book.total_copies > 1000) {
    errors.push('Total copies must be a whole number between 1 and 1000.');
  }
  return { book, errors };
}

async function loadCategories() {
  const [rows] = await pool.query('SELECT id, name FROM categories ORDER BY name');
  return rows;
}

async function findBook(id) {
  const [[book]] = await pool.query(
    `SELECT b.*, c.name AS category FROM books b
     LEFT JOIN categories c ON c.id = b.category_id WHERE b.id = ?`,
    [id]
  );
  if (!book) throw httpError(404, 'Book not found.');
  return book;
}

router.get('/', asyncHandler(async (req, res) => {
  const q = (req.query.q || '').trim();
  const categoryId = parseId(req.query.category);
  const availableOnly = req.query.available === '1';
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);

  const where = [];
  const params = [];
  if (q) {
    where.push('(b.title LIKE ? OR b.author LIKE ? OR b.isbn LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (categoryId) {
    where.push('b.category_id = ?');
    params.push(categoryId);
  }
  if (availableOnly) where.push('b.available_copies > 0');
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM books b ${whereSql}`, params);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const [books] = await pool.query(
    `SELECT b.id, b.title, b.author, b.isbn, b.published_year, b.total_copies, b.available_copies, c.name AS category
     FROM books b LEFT JOIN categories c ON c.id = b.category_id
     ${whereSql} ORDER BY b.title LIMIT ? OFFSET ?`,
    [...params, PAGE_SIZE, (Math.min(page, pages) - 1) * PAGE_SIZE]
  );

  res.render('books/list', {
    title: 'Catalogue',
    books,
    categories: await loadCategories(),
    filters: { q, category: categoryId, available: availableOnly },
    pagination: { page: Math.min(page, pages), pages, total },
  });
}));

router.get('/new', requireAdmin, asyncHandler(async (req, res) => {
  res.render('books/form', { title: 'Add Book', book: { total_copies: 1 }, categories: await loadCategories(), errors: [] });
}));

router.post('/', requireAdmin, asyncHandler(async (req, res) => {
  const { book, errors } = validateBook(req.body);
  if (!errors.length) {
    const [[dup]] = await pool.query('SELECT id FROM books WHERE isbn = ?', [book.isbn]);
    if (dup) errors.push('A book with this ISBN already exists.');
  }
  if (errors.length) {
    return res.status(422).render('books/form', { title: 'Add Book', book, categories: await loadCategories(), errors });
  }
  const [result] = await pool.query(
    `INSERT INTO books (title, author, isbn, category_id, publisher, published_year, total_copies, available_copies, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [book.title, book.author, book.isbn, book.category_id, book.publisher, book.published_year, book.total_copies, book.total_copies, book.description]
  );
  req.flash('success', `"${book.title}" added to the catalogue.`);
  res.redirect(`/books/${result.insertId}`);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) throw httpError(404, 'Book not found.');
  const book = await findBook(id);

  let myLoan = null;
  if (req.user) {
    [[myLoan]] = await pool.query(
      "SELECT id, due_date FROM loans WHERE user_id = ? AND book_id = ? AND status = 'issued'",
      [req.user.id, id]
    );
  }
  let history = [];
  if (req.user && req.user.role === 'admin') {
    [history] = await pool.query(
      `SELECT l.*, u.name AS member FROM loans l JOIN users u ON u.id = l.user_id
       WHERE l.book_id = ? ORDER BY l.issued_at DESC LIMIT 10`,
      [id]
    );
  }
  res.render('books/detail', { title: book.title, book, myLoan, history });
}));

router.get('/:id/edit', requireAdmin, asyncHandler(async (req, res) => {
  const book = await findBook(parseId(req.params.id));
  res.render('books/form', { title: 'Edit Book', book, categories: await loadCategories(), errors: [] });
}));

router.post('/:id', requireAdmin, asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const existing = await findBook(id);
  const { book, errors } = validateBook(req.body);
  book.id = id;

  const onLoan = existing.total_copies - existing.available_copies;
  if (book.total_copies < onLoan) errors.push(`Total copies cannot be less than ${onLoan} (copies currently on loan).`);
  if (!errors.length) {
    const [[dup]] = await pool.query('SELECT id FROM books WHERE isbn = ? AND id <> ?', [book.isbn, id]);
    if (dup) errors.push('Another book already uses this ISBN.');
  }
  if (errors.length) {
    return res.status(422).render('books/form', { title: 'Edit Book', book, categories: await loadCategories(), errors });
  }

  await pool.query(
    `UPDATE books SET title = ?, author = ?, isbn = ?, category_id = ?, publisher = ?, published_year = ?,
            total_copies = ?, available_copies = ?, description = ? WHERE id = ?`,
    [book.title, book.author, book.isbn, book.category_id, book.publisher, book.published_year,
      book.total_copies, book.total_copies - onLoan, book.description, id]
  );
  req.flash('success', 'Book updated.');
  res.redirect(`/books/${id}`);
}));

router.post('/:id/delete', requireAdmin, asyncHandler(async (req, res) => {
  const book = await findBook(parseId(req.params.id));
  if (book.available_copies < book.total_copies) {
    req.flash('error', 'This book cannot be deleted while copies are on loan.');
    return res.redirect(`/books/${book.id}`);
  }
  await pool.query('DELETE FROM books WHERE id = ?', [book.id]);
  req.flash('success', `"${book.title}" was removed from the catalogue.`);
  res.redirect('/books');
}));

module.exports = router;
