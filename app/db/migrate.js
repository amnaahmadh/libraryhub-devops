const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const { dbConfig } = require('../config/db');

const CATEGORIES = [
  ['Computer Science', 'Algorithms, data structures and theory of computation'],
  ['Software Engineering', 'Design, architecture and engineering practices'],
  ['Data Science', 'Statistics, machine learning and data analysis'],
  ['Cloud & DevOps', 'Cloud platforms, automation and operations'],
  ['Fiction', 'Novels and literature'],
];

// [title, author, isbn, category, publisher, year, copies, description]
const BOOKS = [
  ['Introduction to Algorithms', 'Thomas H. Cormen', '9780262046305', 'Computer Science', 'MIT Press', 2022, 4, 'The comprehensive reference on algorithms used in universities worldwide.'],
  ['Structure and Interpretation of Computer Programs', 'Harold Abelson', '9780262510875', 'Computer Science', 'MIT Press', 1996, 2, 'Classic text on the fundamental principles of programming.'],
  ['Clean Code', 'Robert C. Martin', '9780132350884', 'Software Engineering', 'Prentice Hall', 2008, 3, 'A handbook of agile software craftsmanship.'],
  ['Design Patterns', 'Erich Gamma', '9780201633610', 'Software Engineering', 'Addison-Wesley', 1994, 2, 'Elements of reusable object-oriented software.'],
  ['The Pragmatic Programmer', 'David Thomas', '9780135957059', 'Software Engineering', 'Addison-Wesley', 2019, 3, 'Your journey to mastery, 20th anniversary edition.'],
  ['Hands-On Machine Learning', 'Aurelien Geron', '9781098125974', 'Data Science', "O'Reilly Media", 2022, 3, 'Concepts, tools and techniques with Scikit-Learn, Keras and TensorFlow.'],
  ['Python for Data Analysis', 'Wes McKinney', '9781098104030', 'Data Science', "O'Reilly Media", 2022, 2, 'Data wrangling with pandas, NumPy and Jupyter.'],
  ['The Elements of Statistical Learning', 'Trevor Hastie', '9780387848570', 'Data Science', 'Springer', 2009, 1, 'Data mining, inference and prediction.'],
  ['The DevOps Handbook', 'Gene Kim', '9781950508402', 'Cloud & DevOps', 'IT Revolution', 2021, 3, 'How to create world-class agility, reliability and security.'],
  ['Site Reliability Engineering', 'Betsy Beyer', '9781491929124', 'Cloud & DevOps', "O'Reilly Media", 2016, 2, 'How Google runs production systems.'],
  ['AWS Certified Solutions Architect Study Guide', 'Ben Piper', '9781119713081', 'Cloud & DevOps', 'Sybex', 2020, 2, 'Associate (SAA-C02) exam preparation.'],
  ['The Phoenix Project', 'Gene Kim', '9781942788294', 'Fiction', 'IT Revolution', 2018, 2, 'A novel about IT, DevOps and helping your business win.'],
];

async function seed(conn, log) {
  const [[{ count }]] = await conn.query('SELECT COUNT(*) AS count FROM users');
  if (count > 0) {
    log('Seed skipped: database already contains data.');
    return;
  }

  await conn.beginTransaction();
  try {
    const adminHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin@123', 10);
    const memberHash = await bcrypt.hash('Member@123', 10);
    await conn.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ?',
      [[
        ['Library Admin', process.env.ADMIN_EMAIL || 'admin@library.com', adminHash, 'admin'],
        ['Demo Member', 'member@library.com', memberHash, 'member'],
      ]]
    );

    await conn.query('INSERT INTO categories (name, description) VALUES ?', [CATEGORIES]);
    const [cats] = await conn.query('SELECT id, name FROM categories');
    const catId = Object.fromEntries(cats.map((c) => [c.name, c.id]));

    await conn.query(
      `INSERT INTO books (title, author, isbn, category_id, publisher, published_year,
                          total_copies, available_copies, description) VALUES ?`,
      [BOOKS.map(([t, a, i, c, p, y, n, d]) => [t, a, i, catId[c], p, y, n, n, d])]
    );

    // Demo loans for the member: one active, one overdue, one returned with a fine.
    const [[member]] = await conn.query("SELECT id FROM users WHERE email = 'member@library.com'");
    const [books] = await conn.query('SELECT id FROM books ORDER BY id LIMIT 3');
    await conn.query(
      `INSERT INTO loans (user_id, book_id, issued_at, due_date) VALUES
         (?, ?, NOW() - INTERVAL 3 DAY,  NOW() + INTERVAL 11 DAY),
         (?, ?, NOW() - INTERVAL 20 DAY, NOW() - INTERVAL 6 DAY)`,
      [member.id, books[0].id, member.id, books[1].id]
    );
    await conn.query(
      `INSERT INTO loans (user_id, book_id, issued_at, due_date, returned_at, fine_amount, status)
       VALUES (?, ?, NOW() - INTERVAL 30 DAY, NOW() - INTERVAL 16 DAY, NOW() - INTERVAL 14 DAY, 20.00, 'returned')`,
      [member.id, books[2].id]
    );
    await conn.query('UPDATE books SET available_copies = available_copies - 1 WHERE id IN (?)', [[books[0].id, books[1].id]]);

    await conn.commit();
    log('Seed completed: admin@library.com / member@library.com created with sample catalogue.');
  } catch (err) {
    await conn.rollback();
    throw err;
  }
}

async function migrate({ log = console.log } = {}) {
  const { database, ...serverConfig } = dbConfig;
  const conn = await mysql.createConnection({ ...serverConfig, multipleStatements: true });
  try {
    try {
      await conn.query('CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [database]);
    } catch (err) {
      // A least-privilege app user cannot create databases; the database must then already exist.
      log(`Skipping CREATE DATABASE (${err.code}).`);
    }
    await conn.query('USE ??', [database]);

    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await conn.query(schema);
    log(`Schema applied to database "${database}" on ${dbConfig.host}.`);

    await seed(conn, log);
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err.message);
      process.exit(1);
    });
}

module.exports = { migrate };
