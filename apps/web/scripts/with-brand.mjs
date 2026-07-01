import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [brand, script, ...rest] = process.argv.slice(2);

if (!brand || !script) {
  console.error('usage: node scripts/with-brand.mjs <brand> <script> [...args]');
  process.exit(2);
}

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const appRoot = resolve(import.meta.dirname, '..', '..');
const externalClioRoot = resolve(appRoot, '..', '..', 'clio-agent', 'branding');
const brandingRoot =
  brand === 'clio' && existsSync(resolve(externalClioRoot, 'clio', 'brand.json'))
    ? externalClioRoot
    : 'branding';

writeFileSync(
  resolve(appRoot, 'brand.config.local.json'),
  JSON.stringify({ profile: brand, brandingRoot }, null, 2) + '\n',
);

const child = spawn(pnpm, ['run', script, ...rest], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    GACT_BRAND: brand,
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
