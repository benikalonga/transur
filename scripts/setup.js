#!/usr/bin/env node
/**
 * Local setup without Docker:
 *   npm run setup              → install packages, create backend/.env and frontend/.env.local
 *   npm run setup -- --offline → same, with offline mode (no map tiles, online search or GPS needed)
 *
 * Existing .env files are never overwritten.
 */
const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const offline = process.argv.includes('--offline');

const run = (cmd, cwd) => {
  console.log(`\n▶ ${cmd}  (${path.relative(root, cwd) || '.'})`);
  execSync(cmd, { cwd, stdio: 'inherit' });
};

function writeEnv(target, example, edits) {
  const file = path.join(root, target);
  if (fs.existsSync(file)) {
    console.log(`• ${target} already exists, leaving it as it is`);
    return;
  }
  let text = fs.readFileSync(path.join(root, example), 'utf8');
  for (const [key, value] of Object.entries(edits)) {
    const line = new RegExp(`^#?\\s*${key}=.*$`, 'm');
    text = line.test(text) ? text.replace(line, `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`;
  }
  fs.writeFileSync(file, text);
  console.log(`✓ created ${target}`);
}

run('npm install --no-audit --no-fund', path.join(root, 'backend'));
run('npm install --no-audit --no-fund', path.join(root, 'frontend'));

writeEnv('backend/.env', 'backend/.env.example', {
  NODE_ENV: 'development',
  JWT_SECRET: crypto.randomBytes(48).toString('hex'),
  PAYMENT_WEBHOOK_SECRET: crypto.randomBytes(24).toString('hex'),
  SMS_API_KEY: '',
});
writeEnv('frontend/.env.local', 'frontend/.env.example', {
  NEXT_PUBLIC_OFFLINE_MODE: offline ? '1' : '0',
});

console.log(`
Next steps
  1. Create the database user once (see backend/db-setup.sql), then set DB_PASSWORD in backend/.env
  2. npm run db:migrate
  3. npm run staff:owner -- YOUR_EMAIL@example.com 'YOUR_PASSWORD' "YOUR_NAME"
  4. npm run dev        → web app http://localhost:3000, API http://localhost:5000/api
`);
