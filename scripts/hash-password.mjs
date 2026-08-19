#!/usr/bin/env node
/**
 * Generates the two environment variables the admin section needs.
 *
 *   node scripts/hash-password.mjs
 *
 * The plaintext password is never written to disk, logged, or stored — only
 * the scrypt hash is printed. Paste both values into Netlify.
 */
import { createInterface } from 'node:readline';
import { randomBytes, scryptSync } from 'node:crypto';

const rl = createInterface({ input: process.stdin, output: process.stdout });

const password = await new Promise((resolve) => {
  rl.question('Choose an admin password (input is visible): ', (answer) => {
    rl.close();
    resolve(answer);
  });
});

if (password.trim().length < 12) {
  console.error('\nToo short — use at least 12 characters.');
  process.exit(1);
}

const salt = randomBytes(16);
const hash = `scrypt$${salt.toString('hex')}$${scryptSync(password.trim(), salt, 64).toString('hex')}`;

console.log('\nAdd these to your Netlify environment variables:\n');
console.log(`ADMIN_PASSWORD_HASH=${hash}`);
console.log(`ADMIN_SESSION_SECRET=${randomBytes(32).toString('hex')}`);
console.log('\nChanging ADMIN_SESSION_SECRET signs everyone out immediately.\n');
