const jwt       = require('jsonwebtoken');

const authenticate = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer '))
    return res.status(401).json({ error: 'Token manquant' });

  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    // decoded payload: { adminId, role, name, email }
    req.admin = {
      id:    decoded.adminId,
      role:  decoded.role,
      name:  decoded.name,
      email: decoded.email,
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
};

const requireSuperAdmin = (req, res, next) => {
  if (req.admin?.role !== 'superadmin')
    return res.status(403).json({ error: 'Accès superadmin requis' });
  next();
};

module.exports = { authenticate, requireSuperAdmin };
