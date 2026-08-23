#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const action = process.argv[2] ?? 'test';
const commandByAction = {
  test: ['test', '-timeout=20m', './...'],
  race: ['test', '-timeout=20m', '-race', './...'],
  vet: ['vet', './...'],
  fmt: ['fmt', './...'],
};
const command = commandByAction[action];
if (!command) {
  console.error(`Unknown Go workspace action: ${action}`);
  process.exit(2);
}

const goWork = readFileSync(resolve(root, 'go.work'), 'utf8');
const useBlock = goWork.match(/use\s*\(([\s\S]*?)\)/u)?.[1] ?? '';
const modules = [...useBlock.matchAll(/^\s*(\.\/\S+)\s*$/gmu)].map((match) => match[1]);
if (modules.length === 0) {
  console.error('No modules found in go.work');
  process.exit(1);
}

for (const module of modules) {
  console.log(`==> go ${action} ${module}`);
  const result = spawnSync('go', command, {
    cwd: resolve(root, module),
    env: process.env,
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
