require('dotenv').config();
const { migrate } = require('./db/migrate');

const PORT = Number(process.env.PORT || 3000);
const MIGRATION_ATTEMPTS = Number(process.env.MIGRATION_ATTEMPTS || 20);
const MIGRATION_DELAY_MS = 3000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The database container can still be initialising when this container starts, so keep retrying
// for about a minute before giving up.
async function migrateWithRetry() {
  for (let attempt = 1; attempt <= MIGRATION_ATTEMPTS; attempt++) {
    try {
      await migrate();
      return;
    } catch (err) {
      console.error(`Migration attempt ${attempt}/${MIGRATION_ATTEMPTS} failed: ${err.code || err.message}`);
      if (attempt < MIGRATION_ATTEMPTS) await sleep(MIGRATION_DELAY_MS);
    }
  }
  // Keep serving so /health can report the database problem instead of the app crash-looping.
  console.error('Database still unreachable, starting without migrations.');
}

async function start() {
  if (process.env.SKIP_MIGRATIONS !== 'true') await migrateWithRetry();

  const app = require('./app');
  const { pool } = require('./config/db');
  const server = app.listen(PORT, () => {
    console.log(`Library Management System listening on port ${PORT} (${process.env.DEPLOY_TARGET || 'Local'})`);
  });

  // Node.js runs as PID 1 in the container and ignores SIGTERM unless handled, which would make
  // `docker stop` wait 10 s and then kill the process.
  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down`);
    server.close(() => {
      Promise.allSettled([pool.end(), app.sessionStore.close()]).finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start();
