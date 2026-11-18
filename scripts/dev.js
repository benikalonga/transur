#!/usr/bin/env node
/**
 * Runs the API and the web app together (no Docker, no extra packages).
 * Ctrl+C stops both. Output lines are prefixed with [api] or [web].
 */
const { spawn } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const apps = [
  { name: 'api', cwd: path.join(root, 'backend'), args: ['run', 'dev'] },
  { name: 'web', cwd: path.join(root, 'frontend'), args: ['run', 'dev'] },
];

const children = apps.map(({ name, cwd, args }) => {
  const child = spawn(npm, args, { cwd, env: process.env });
  const prefix = (stream, out) => {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop();
      lines.forEach((line) => out.write(`[${name}] ${line}\n`));
    });
  };
  prefix(child.stdout, process.stdout);
  prefix(child.stderr, process.stderr);
  child.on('exit', (code) => {
    console.log(`[${name}] exited with code ${code}`);
    shutdown(code || 0);
  });
  return child;
});

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  children.forEach((c) => c.exitCode === null && c.kill('SIGTERM'));
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
