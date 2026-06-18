import { spawn } from 'node:child_process';

const [brand, script, ...rest] = process.argv.slice(2);

if (!brand || !script) {
  console.error('usage: node scripts/with-brand.mjs <brand> <script> [...args]');
  process.exit(2);
}

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const child = spawn(pnpm, ['run', script, ...rest], {
  stdio: 'inherit',
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
