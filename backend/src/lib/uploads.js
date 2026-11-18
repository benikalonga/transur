const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const AVATAR_DIR = path.join(process.cwd(), 'uploads', 'avatars');
const ALLOWED = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(AVATAR_DIR, { recursive: true });
      cb(null, AVATAR_DIR);
    },
    // Never trust the client's file name or extension.
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${ALLOWED[file.mimetype]}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, Boolean(ALLOWED[file.mimetype])),
});

const publicPath = (file) => (file ? `/uploads/avatars/${file.filename}` : null);

module.exports = { avatarUpload, publicPath };
