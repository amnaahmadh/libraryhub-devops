// Minimal one-shot flash messages stored in the session.
function flashMiddleware(req, res, next) {
  // express-session skips creating req.session when its store is disconnected.
  if (!req.session) {
    req.flash = () => {};
    return next();
  }
  res.locals.flash = req.session.flash || [];
  delete req.session.flash;
  req.flash = (type, message) => {
    req.session.flash = req.session.flash || [];
    req.session.flash.push({ type, message });
  };
  next();
}

module.exports = { flashMiddleware };
