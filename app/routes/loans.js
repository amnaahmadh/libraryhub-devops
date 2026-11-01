const express = require('express');
const { pool } = require('../config/db');
const { requireLogin } = require('../middleware/auth');
const { asyncHandler, parseId, LOAN_DAYS, MAX_ACTIVE_LOANS, FINE_PER_DAY } = require('../utils/helpers');

const router = express.Router();

router.use(requireLogin);

// Borrow a book. Row locks keep the copy count correct under concurrent requests.
router.post('/', asyncHandler(async (req, res) => {
  const bookId = parseId(req.body.book_id);
  const conn = await pool.getConnection();
  let message;
  try {
    await conn.beginTransaction();
    const [[book]] = await conn.query('SELECT id, title, available_copies FROM books WHERE id = ? FOR UPDATE', [bookId]);
    const [[{ active }]] = await conn.query(
      "SELECT COUNT(*) AS active FROM loans WHERE user_id = ? AND status = 'issued' FOR UPDATE",
      [req.user.id]
    );
    const [[duplicate]] = await conn.query(
      "SELECT id FROM loans WHERE user_id = ? AND book_id = ? AND status = 'issued'",
      [req.user.id, bookId]
    );

    if (!book) message = ['error', 'Book not found.'];
    else if (duplicate) message = ['error', 'You already have a copy of this book.'];
    else if (active >= MAX_ACTIVE_LOANS) message = ['error', `You can borrow at most ${MAX_ACTIVE_LOANS} books at a time.`];
    else if (book.available_copies < 1) message = ['error', 'No copies are currently available.'];

    if (message) {
      await conn.rollback();
    } else {
      await conn.query(
        'INSERT INTO loans (user_id, book_id, due_date) VALUES (?, ?, NOW() + INTERVAL ? DAY)',
        [req.user.id, bookId, LOAN_DAYS]
      );
      await conn.query('UPDATE books SET available_copies = available_copies - 1 WHERE id = ?', [bookId]);
      await conn.commit();
      message = ['success', `You borrowed "${book.title}". Please return it within ${LOAN_DAYS} days.`];
    }
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  req.flash(...message);
  res.redirect(bookId ? `/books/${bookId}` : '/books');
}));

router.get('/my', asyncHandler(async (req, res) => {
  const [loans] = await pool.query(
    `SELECT l.*, b.title, b.author,
            (l.status = 'issued' AND l.due_date < NOW()) AS overdue,
            GREATEST(DATEDIFF(NOW(), l.due_date), 0) * ? AS accrued_fine
     FROM loans l JOIN books b ON b.id = l.book_id
     WHERE l.user_id = ? ORDER BY l.status = 'issued' DESC, l.issued_at DESC`,
    [FINE_PER_DAY, req.user.id]
  );
  res.render('loans/my', { title: 'My Loans', loans, finePerDay: FINE_PER_DAY, maxLoans: MAX_ACTIVE_LOANS });
}));

// Members return their own loans; admins can return any loan.
router.post('/:id/return', asyncHandler(async (req, res) => {
  const loanId = parseId(req.params.id);
  const conn = await pool.getConnection();
  let message;
  try {
    await conn.beginTransaction();
    const [[loan]] = await conn.query(
      `SELECT l.*, b.title FROM loans l JOIN books b ON b.id = l.book_id WHERE l.id = ? FOR UPDATE`,
      [loanId]
    );
    if (!loan || (loan.user_id !== req.user.id && req.user.role !== 'admin')) {
      message = ['error', 'Loan not found.'];
    } else if (loan.status === 'returned') {
      message = ['error', 'This book has already been returned.'];
    }

    if (message) {
      await conn.rollback();
    } else {
      await conn.query(
        `UPDATE loans SET status = 'returned', returned_at = NOW(),
                fine_amount = GREATEST(DATEDIFF(NOW(), due_date), 0) * ? WHERE id = ?`,
        [FINE_PER_DAY, loanId]
      );
      await conn.query('UPDATE books SET available_copies = available_copies + 1 WHERE id = ?', [loan.book_id]);
      const [[{ fine_amount: fine }]] = await conn.query('SELECT fine_amount FROM loans WHERE id = ?', [loanId]);
      await conn.commit();
      message = Number(fine) > 0
        ? ['warning', `"${loan.title}" returned late. A fine of Rs. ${Number(fine).toFixed(0)} has been recorded.`]
        : ['success', `"${loan.title}" returned on time. Thank you!`];
    }
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  req.flash(...message);
  res.redirect(req.user.role === 'admin' && req.body.from === 'admin' ? '/admin/loans' : '/loans/my');
}));

module.exports = router;
