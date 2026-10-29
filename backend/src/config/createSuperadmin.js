require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query, pool } = require('./database');

// =============================================================================
// Crée ou réinitialise un compte superadmin
// Usage : npm run admin:create -- <email> <password> [name]
// =============================================================================

const run = async () => {
  const [email, password, name] = process.argv.slice(2);

  if (!email || !password) {
    console.error('Usage : npm run admin:create -- <email> <password> [name]');
    process.exit(1);
  }
  if (password.length < 12) {
    console.error('❌ Le mot de passe doit contenir au moins 12 caractères');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const { rows } = await query('SELECT id FROM admins WHERE email = ?', [email]);

  if (rows[0]) {
    await query(
      `UPDATE admins SET password_hash = ?, role = 'superadmin', status = 'active' WHERE id = ?`,
      [passwordHash, rows[0].id]
    );
    console.log(`✅ Superadmin mis à jour : ${email}`);
  } else {
    await query(
      `INSERT INTO admins (name, email, password_hash, role, status, created_at)
       VALUES (?, ?, ?, 'superadmin', 'active', NOW())`,
      [name || email.split('@')[0], email, passwordHash]
    );
    console.log(`✅ Superadmin créé : ${email}`);
  }
};

run()
  .catch((err) => { console.error('❌', err.message); process.exitCode = 1; })
  .finally(() => pool.end());
