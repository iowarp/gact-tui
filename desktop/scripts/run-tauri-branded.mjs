#!/usr/bin/env node
// Run the Tauri CLI (dev/build/...) with the brand-selected config overlay
// applied via `--config`, so native builds (productName, identifier, window
// title, bundled icons, ...) match whichever brand the web build selected.
//
// Brand selection is unchanged by this wrapper: it defers entirely to the
// shared resolver (branding/brand-config.mjs), which reads brand.config.json
// unless a sibling brand.config.local.json override is present. With NO
// override present — the state of a clean clone, and of CI — this resolves
// the tracked default: profile "gact", which has no product-owned
// tauri.gact.conf.json of its own, so resolveNativeBrandOverlay() falls back
// to the neutral desktop/src-tauri/tauri.gact.conf.json overlay already
// checked into this repo. An embedding project (e.g. clio-agent) supplies a
// brand.config.local.json pointing at its own branding root to build a
// different product instead; this script never guesses or defaults to one.
//
// Usage (invoked via package.json's tauri:dev / tauri:build* scripts):
//   node scripts/run-tauri-branded.mjs <tauri-args...> [--merge-config <path>...]
//
// `resolveNativeBrandOverlay` and `mergeConfig` both take an explicit
// argument already ( `resolveNativeBrandOverlay(configPath)` reads a brand
// config FILE rather than an in-memory object, consistent with
// branding/brand-config.mjs's "config file, never an env var, never an
// inline object" contract) — tests build a real temporary config file and
// branding root instead of stubbing the resolver.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveBrandConfig } from '../../branding/brand-config.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(scriptDir, '..');
const tauriDir = resolve(desktopDir, 'src-tauri');
const require = createRequire(import.meta.url);

export function mergeConfig(base, overlay) {
  if (
    base === null ||
    overlay === null ||
    Array.isArray(base) ||
    Array.isArray(overlay) ||
    typeof base !== 'object' ||
    typeof overlay !== 'object'
  ) {
    return overlay;
  }

  const merged = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    merged[key] = key in merged ? mergeConfig(merged[key], value) : value;
  }
  return merged;
}

export function resolveNativeBrandOverlay(configPath) {
  const { profile, brandingRoot } = resolveBrandConfig(configPath);
  const productOverlay = resolve(
    brandingRoot,
    profile,
    `tauri.${profile}.conf.json`,
  );
  if (existsSync(productOverlay)) return productOverlay;

  const workspaceOverlay = resolve(tauriDir, `tauri.${profile}.conf.json`);
  return existsSync(workspaceOverlay) ? workspaceOverlay : null;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function materializeMergedOverlay(paths, outputPath) {
  const merged = paths.reduce(
    (current, path) => mergeConfig(current, readJson(path)),
    {},
  );
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(merged, null, 2)}\n`);
  return outputPath;
}

function main(argv) {
  const separator = argv.indexOf('--merge-config');
  const tauriArgs = separator >= 0 ? argv.slice(0, separator) : argv;
  const mergePaths = separator >= 0 ? argv.slice(separator + 1) : [];
  if (tauriArgs.length === 0) {
    throw new Error('Expected a Tauri command such as dev or build.');
  }

  const brandOverlay = resolveNativeBrandOverlay();
  const overlays = [brandOverlay, ...mergePaths.map((path) => resolve(path))].filter(
    Boolean,
  );
  let configArgs = [];
  if (overlays.length === 1) {
    configArgs = ['--config', overlays[0]];
  } else if (overlays.length > 1) {
    const generated = materializeMergedOverlay(
      overlays,
      resolve(tauriDir, 'gen', 'tauri-brand-merged.conf.json'),
    );
    configArgs = ['--config', generated];
  }

  const tauriCli = resolve(dirname(require.resolve('@tauri-apps/cli')), 'tauri.js');
  const result = spawnSync(process.execPath, [tauriCli, ...tauriArgs, ...configArgs], {
    cwd: desktopDir,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
