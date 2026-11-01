const os = require('os');
const express = require('express');
const { pool, dbConfig } = require('../config/db');
const build = require('../config/build');
const { asyncHandler } = require('../utils/helpers');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const [[stats]] = await pool.query(`
    SELECT (SELECT COUNT(*) FROM books)                                  AS books,
           (SELECT COALESCE(SUM(available_copies), 0) FROM books)        AS available,
           (SELECT COUNT(*) FROM categories)                             AS categories,
           (SELECT COUNT(*) FROM users WHERE role = 'member')            AS members`);
  const [recent] = await pool.query(`
    SELECT b.id, b.title, b.author, b.available_copies, c.name AS category
    FROM books b LEFT JOIN categories c ON c.id = b.category_id
    ORDER BY b.created_at DESC, b.id DESC LIMIT 6`);
  res.render('index', { title: 'Home', stats, recent });
}));

async function systemInfo() {
  const info = {
    application: 'Library Management System',
    deployment: process.env.DEPLOY_TARGET || 'Local',
    version: build.version,
    build: { number: build.buildNumber, commit: build.commit },
    container: build.container,
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    node: process.version,
    uptimeSeconds: Math.round(process.uptime()),
    database: { host: dbConfig.host, name: dbConfig.database, status: 'disconnected' },
  };
  try {
    const [[row]] = await pool.query('SELECT VERSION() AS version, NOW() AS serverTime');
    info.database.status = 'connected';
    info.database.version = row.version;
    info.database.serverTime = row.serverTime;
  } catch (err) {
    info.database.error = err.code || err.message;
  }
  return info;
}

router.get('/health', asyncHandler(async (req, res) => {
  const info = await systemInfo();
  res.status(info.database.status === 'connected' ? 200 : 503).json({
    status: info.database.status === 'connected' ? 'ok' : 'degraded',
    ...info,
  });
}));

router.get('/about', asyncHandler(async (req, res) => {
  res.render('about', { title: 'About & Deployment', info: await systemInfo() });
}));

module.exports = router;
