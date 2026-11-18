const env = require('../config/env');
const { HttpError } = require('../lib/http');

const routeNotFound = (req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
};

// eslint-disable-next-line no-unused-vars
const errorResponder = (err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...err.extra });
  }
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'That record already exists.' });
  }
  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({ error: 'A referenced record does not exist.' });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File is too large (5 MB max).' });
  }

  console.error(`[api] ${req.method} ${req.path} →`, err);
  res.status(500).json({ error: env.isProd ? 'Something went wrong on our side.' : err.message });
};

module.exports = { routeNotFound, errorResponder };
