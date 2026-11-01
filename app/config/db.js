require('dotenv').config();
const mysql = require('mysql2/promise');

// In Docker Compose DB_HOST is the name of the database service (e.g. "db").
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'library_app',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'library_db',
};

const pool = mysql.createPool({
  ...dbConfig,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
  queueLimit: 0,
});

module.exports = { pool, dbConfig };
