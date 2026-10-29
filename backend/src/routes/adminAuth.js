const express  = require('express');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const { query } = require('../config/database');

const router = express.Router();

// Helper — sign a token for an admin row
const signToken = (admin) =>
  jwt.sign(
    { adminId: admin.id, role: admin.role, name: admin.name, email: admin.email },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

// POST /api/admin/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ error: 'Nom, email et mot de passe sont requis' });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email))
      return res.status(400).json({ error: 'Format d\'email invalide' });

    if (password.length < 8)
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères' });

    // Check duplicate email
    const { rows: existing } = await query(
      'SELECT id FROM admins WHERE email = ?',
      [email]
    );
    if (existing[0])
      return res.status(409).json({ error: 'Un compte avec cet email existe déjà' });

    const passwordHash = await bcrypt.hash(password, 10);

    await query(
      `INSERT INTO admins (name, email, password_hash, role, status, created_at)
       VALUES (?, ?, ?, 'admin', 'pending', NOW())`,
      [name, email, passwordHash]
    );

    return res.status(201).json({
      message: 'Compte créé avec succès. Votre compte est en attente d\'approbation par un superadmin.',
    });
  } catch (err) {
    console.error('[adminAuth] register error:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/admin/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: 'Email et mot de passe sont requis' });

    const { rows } = await query(
      'SELECT id, name, email, password_hash, role, status FROM admins WHERE email = ?',
      [email]
    );

    if (!rows[0])
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

    const admin = rows[0];

    // Accounts without a password hash (e.g. created by the old override) cannot log in
    const passwordMatch = admin.password_hash
      ? await bcrypt.compare(password, admin.password_hash)
      : false;
    if (!passwordMatch)
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

    if (admin.status === 'pending')
      return res.status(403).json({ error: 'Votre compte est en attente d\'approbation' });

    if (admin.status === 'rejected')
      return res.status(403).json({ error: 'Votre compte a été rejeté. Contactez un superadmin.' });

    if (admin.status !== 'active')
      return res.status(403).json({ error: 'Compte inactif. Contactez un superadmin.' });

    await query('UPDATE admins SET last_login = NOW() WHERE id = ?', [admin.id]);

    const token = signToken(admin);
    return res.json({
      token,
      admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role },
    });
  } catch (err) {
    console.error('[adminAuth] login error:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
