const express  = require('express');
const router   = express.Router();
const jwt      = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { query } = require('../config/database');
const { generateOTP, sendOTP } = require('../services/smsService');

// ─── Multer ───────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/profiles';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) =>
    cb(null, `${Date.now()}-${uuidv4().slice(0,8)}${path.extname(file.originalname)}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});

const signToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

// ─── POST /api/auth/send-otp ──────────────────────────────────────────────────
router.post('/send-otp',
  body('phone').matches(/^\+?[0-9]{8,15}$/).withMessage('Numéro invalide'),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const { phone, purpose = 'login' } = req.body;
      await query('UPDATE otp_codes SET used = 1 WHERE phone = ? AND purpose = ? AND used = 0', [phone, purpose]);

      const code      = generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await query(
        'INSERT INTO otp_codes (id, phone, code, purpose, expires_at) VALUES (?, ?, ?, ?, ?)',
        [uuidv4(), phone, code, purpose, expiresAt]
      );
      await sendOTP(phone, code);
      res.json({ message: 'Code OTP envoyé', phone });
    } catch (err) { next(err); }
  }
);

// ─── POST /api/auth/verify-otp ────────────────────────────────────────────────
router.post('/verify-otp',
  body('phone').notEmpty(),
  body('code').isLength({ min: 6, max: 6 }),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const { phone, code, purpose = 'login' } = req.body;
      const { rows: otpRows } = await query(
        `SELECT * FROM otp_codes
         WHERE phone = ? AND code = ? AND purpose = ? AND used = 0 AND expires_at > UTC_TIMESTAMP()
         ORDER BY created_at DESC LIMIT 1`,
        [phone, code, purpose]
      );
      if (!otpRows[0]) {
        await query('UPDATE otp_codes SET attempts = attempts + 1 WHERE phone = ? AND used = 0', [phone]);
        return res.status(400).json({ error: 'Code invalide ou expiré' });
      }
      await query('UPDATE otp_codes SET used = 1 WHERE id = ?', [otpRows[0].id]);

      const { rows: userRows } = await query('SELECT * FROM users WHERE phone = ?', [phone]);
      if (userRows[0]) {
        const u = userRows[0];
        await query('UPDATE users SET last_seen = NOW() WHERE id = ?', [u.id]);
        return res.json({
          message: 'Connexion réussie',
          token: signToken(u.id),
          user: { id: u.id, name: u.name, phone: u.phone, role: u.role, status: u.status, photo_url: u.photo_url },
          isNewUser: false,
        });
      }
      // New user
      const tempToken = jwt.sign({ phone, isTemp: true }, process.env.JWT_SECRET, { expiresIn: '30m' });
      res.json({ message: 'OTP vérifié', tempToken, isNewUser: true });
    } catch (err) { next(err); }
  }
);

// ─── POST /api/auth/register/client ──────────────────────────────────────────
router.post('/register/client', async (req, res, next) => {
  try {
    const { tempToken, name, fcm_token } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nom requis' });
    const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    if (!decoded.isTemp) return res.status(400).json({ error: 'Token invalide' });

    const id = uuidv4();
    await query(
      'INSERT INTO users (id, phone, name, role, status, fcm_token) VALUES (?, ?, ?, ?, ?, ?)',
      [id, decoded.phone, name.trim(), 'client', 'active', fcm_token || null]
    );
    const { rows } = await query('SELECT * FROM users WHERE id = ?', [id]);
    res.status(201).json({ message: 'Compte créé', token: signToken(id), user: rows[0] });
  } catch (err) { next(err); }
});

// ─── POST /api/auth/register/driver ──────────────────────────────────────────
router.post('/register/driver', upload.single('photo'), async (req, res, next) => {
  try {
    const { tempToken, name, vehicle_type, vehicle_plate, vehicle_color, vehicle_brand, fcm_token } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nom requis' });
    if (!vehicle_type) return res.status(400).json({ error: 'Type de véhicule requis' });
    const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    if (!decoded.isTemp) return res.status(400).json({ error: 'Token invalide' });

    const photoUrl = req.file ? `/uploads/profiles/${req.file.filename}` : null;
    const id = uuidv4();
    await query(
      'INSERT INTO users (id, phone, name, role, status, photo_url, fcm_token) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, decoded.phone, name.trim(), 'driver', 'active', photoUrl, fcm_token || null]
    );
    await query(
      'INSERT INTO driver_profiles (id, user_id, vehicle_type, vehicle_plate, vehicle_color, vehicle_brand) VALUES (?, ?, ?, ?, ?, ?)',
      [uuidv4(), id, vehicle_type, vehicle_plate || null, vehicle_color || null, vehicle_brand || null]
    );
    const { rows } = await query('SELECT * FROM users WHERE id = ?', [id]);
    res.status(201).json({ message: 'Compte chauffeur créé', token: signToken(id), user: rows[0] });
  } catch (err) { next(err); }
});

// ─── POST /api/auth/register/delivery ────────────────────────────────────────
router.post('/register/delivery', upload.single('photo'), async (req, res, next) => {
  try {
    const { tempToken, name, transport_type, vehicle_plate, vehicle_color, vehicle_brand, fcm_token } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nom requis' });
    if (!transport_type) return res.status(400).json({ error: 'Moyen de transport requis' });
    const validTypes = ['moto', 'velo', 'pied', 'voiture'];
    if (!validTypes.includes(transport_type)) return res.status(400).json({ error: 'Type de transport invalide' });
    if (transport_type === 'voiture' && !vehicle_plate?.trim()) {
      return res.status(400).json({ error: 'Plaque d\'immatriculation requise pour une voiture' });
    }
    const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    if (!decoded.isTemp) return res.status(400).json({ error: 'Token invalide' });

    const photoUrl = req.file ? `/uploads/profiles/${req.file.filename}` : null;
    const id = uuidv4();
    await query(
      'INSERT INTO users (id, phone, name, role, status, photo_url, fcm_token) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, decoded.phone, name.trim(), 'delivery', 'active', photoUrl, fcm_token || null]
    );
    await query(
      `INSERT INTO delivery_profiles (id, user_id, transport_type, vehicle_plate, vehicle_color, vehicle_brand)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uuidv4(), id, transport_type,
       transport_type === 'voiture' ? (vehicle_plate?.trim() || null) : null,
       transport_type === 'voiture' ? (vehicle_color?.trim() || null) : null,
       transport_type === 'voiture' ? (vehicle_brand?.trim() || null) : null]
    );
    const { rows } = await query('SELECT * FROM users WHERE id = ?', [id]);
    res.status(201).json({ message: 'Compte livreur créé', token: signToken(id), user: rows[0] });
  } catch (err) { next(err); }
});

module.exports = router;
