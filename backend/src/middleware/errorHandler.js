const notFound = (req, res) => {
  res.status(404).json({ error: `Route non trouvée: ${req.method} ${req.path}` });
};

const errorHandler = (err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  if (err.code === '23505') {
    return res.status(409).json({ error: 'Cette entrée existe déjà.' });
  }
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Référence invalide.' });
  }
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }

  const status = err.status || 500;
  res.status(status).json({
    error: process.env.NODE_ENV === 'production' ? 'Erreur interne du serveur' : err.message,
  });
};

module.exports = { notFound, errorHandler };
