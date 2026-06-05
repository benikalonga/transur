const jwt   = require('jsonwebtoken');
const { query } = require('../config/database');

const authenticate = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer '))
    return res.status(401).json({ error: 'Token manquant' });

  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    const { rows } = await query(
      'SELECT id, phone, name, role, status FROM users WHERE id = ?',
      [decoded.userId]
    );
    if (!rows[0]) return res.status(401).json({ error: 'Utilisateur introuvable' });
    if (['suspended', 'blocked'].includes(rows[0].status))
      return res.status(403).json({ error: 'Compte suspendu. Contactez le support.' });
    req.user = rows[0];
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role))
    return res.status(403).json({ error: 'Accès non autorisé' });
  next();
};

const requireActiveWallet = async (req, res, next) => {
  if (!['driver', 'delivery'].includes(req.user.role)) return next();
  const { rows } = await query('SELECT is_blocked FROM wallets WHERE user_id = ?', [req.user.id]);
  if (rows[0]?.is_blocked) {
    return res.status(403).json({
      error: 'Wallet bloqué. Rechargez votre compte pour continuer.',
      code: 'WALLET_BLOCKED',
    });
  }
  next();
};

module.exports = { authenticate, requireRole, requireActiveWallet };
