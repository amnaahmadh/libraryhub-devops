const path = require('path');
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const helmet = require('helmet');
const { dbConfig } = require('./config/db');
const build = require('./config/build');
const { attachUser } = require('./middleware/auth');
const { flashMiddleware } = require('./middleware/flash');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);

app.locals.fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

app.use(
  helmet({
    // The deployments are served over plain HTTP, so upgrading sub-requests to HTTPS would break CSS.
    contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } },
    strictTransportSecurity: false,
  })
);
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

// Defaults first, so the error page still renders if the session store or database is unreachable.
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.deployTarget = process.env.DEPLOY_TARGET || 'Local';
  res.locals.buildLabel = build.label;
  res.locals.currentUser = null;
  res.locals.flash = [];
  next();
});

// Sessions live in MySQL, so logins survive a container restart or replacement.
const sessionStore = new MySQLStore({
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database,
  createDatabaseTable: true,
  clearExpired: true,
  checkExpirationInterval: 15 * 60 * 1000,
});
sessionStore.onReady().catch((err) => console.error('Session store unavailable:', err.message));

app.use(
  session({
    name: 'lms.sid',
    secret: process.env.SESSION_SECRET || 'change-me-in-production',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 },
  })
);

// express-session can send the redirect before the store write finishes, so the follow-up request
// may miss a fresh login or flash message. Persist the session first.
app.use((req, res, next) => {
  const redirect = res.redirect.bind(res);
  res.redirect = (...args) => (req.session ? req.session.save(() => redirect(...args)) : redirect(...args));
  next();
});
app.use(flashMiddleware);
app.use(attachUser);

app.use('/', require('./routes/index'));
app.use('/', require('./routes/auth'));
app.use('/books', require('./routes/books'));
app.use('/categories', require('./routes/categories'));
app.use('/loans', require('./routes/loans'));
app.use('/admin', require('./routes/admin'));

app.use((req, res) => {
  res.status(404).render('error', { title: 'Not Found', status: 404, message: 'The page you are looking for does not exist.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (!err.status || err.status >= 500) console.error(err);
  res.status(err.status || 500).render('error', {
    title: 'Error',
    status: err.status || 500,
    message: err.expose ? err.message : 'Something went wrong. Please try again later.',
  });
});

module.exports = app;
module.exports.sessionStore = sessionStore;
