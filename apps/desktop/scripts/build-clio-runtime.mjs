#!/usr/bin/env node
// Cross-platform launcher for the bundled clio-agent runtime builder.
//
// Picks the right per-OS script:
//   - Windows: scripts/build-clio-runtime.ps1 via pwsh (preferred) or
//     Windows PowerShell (powershell.exe) as a fallback.
//   - macOS / Linux: scripts/build-clio-runtime.sh via bash.
//
// Used by `pnpm build-clio-runtime` and the bundled tauri build script.
// Any extra args are forwarded to the underlying script.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const extra = process.argv.slice(2);

function run(cmd, args) {
  return spawnSync(cmd, args, { stdio: 'inherit' });
}

let result;
if (process.platform === 'win32') {
  const ps1 = join(here, 'build-clio-runtime.ps1');
  // Prefer PowerShell 7+ (pwsh); fall back to Windows PowerShell 5.1.
  const common = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, ...extra];
  result = run('pwsh', common);
  if (result.error && result.error.code === 'ENOENT') {
    result = run('powershell', common);
  }
} else {
  const sh = join(here, 'build-clio-runtime.sh');
  result = run('bash', [sh, ...extra]);
}

if (result.error) {
  console.error(`build-clio-runtime: failed to spawn builder: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
