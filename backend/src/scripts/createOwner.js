/**
 * Create (or reset) a console owner account.
 *   npm run staff:owner -- you@example.com 'a-strong-password' "Your Name"
 */
const bcrypt = require('bcryptjs');
const { randomUUID: uuid } = require('crypto');
require('../config/env');
const { one, sql, pool } = require('../db/pool');

const main = async () => {
  const [email, password, ...nameParts] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Usage: npm run staff:owner -- <email> <password> [full name]');
    process.exit(1);
  }
  if (password.length < 12) {
    console.error('✖ Owner passwords must be at least 12 characters.');
    process.exit(1);
  }

  const normalized = email.trim().toLowerCase();
  const hash = await bcrypt.hash(password, 12);
  const existing = await one('SELECT id FROM staff WHERE email = ?', [normalized]);

  if (existing) {
    await sql("UPDATE staff SET password_hash = ?, role = 'owner', access_status = 'active' WHERE id = ?", [hash, existing.id]);
    console.log(`✓ owner updated: ${normalized}`);
  } else {
    await sql(
      "INSERT INTO staff (id, email, full_name, password_hash, role, access_status) VALUES (?, ?, ?, ?, 'owner', 'active')",
      [uuid(), normalized, nameParts.join(' ') || normalized.split('@')[0], hash]
    );
    console.log(`✓ owner created: ${normalized}`);
  }
};

main()
  .catch((err) => {
    console.error('✖', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
