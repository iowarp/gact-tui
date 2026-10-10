import { spawnSync } from 'node:child_process';

// Review pages exercise the production renderer without entering shipped builds.
const pnpm = process.env.npm_execpath;
if (!pnpm) throw new Error('Run browser tests through pnpm test:e2e.');
const result = spawnSync(process.execPath, [pnpm, 'build'], {
  env: { ...process.env, CLIO_REVIEW_FIXTURES: '1' },
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
