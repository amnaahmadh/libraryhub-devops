const LOAN_DAYS = 14;
const MAX_ACTIVE_LOANS = 3;
const FINE_PER_DAY = 10; // PKR

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  return err;
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Only allow same-site relative redirects after login.
function safeRedirect(target, fallback = '/') {
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') ? target : fallback;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = { LOAN_DAYS, MAX_ACTIVE_LOANS, FINE_PER_DAY, asyncHandler, httpError, parseId, safeRedirect, EMAIL_RE };
