#!/usr/bin/env node
// Generate src-tauri/gen/brand-backend.json from the selected brand profile.
//
// Reads apps/branding/<brand>/brand.json, extracts and normalizes its optional
// "backend" block (applying the same defaults as the vite brand plugin), and
// writes the result to src-tauri/gen/brand-backend.json. Rust embeds that file
// via include_str! so the supervisor's backend config is brand-driven.
//
// The DEFAULT_BACKEND constant and resolveBackend() below are duplicated from
// apps/web/vite-plugin-brand.ts on purpose: a .mjs script cannot import the
// .ts plugin without a build step. Keep the two literally in sync.
//
// Usage (run from apps/desktop, the tauri project dir):
//   node scripts/gen-brand-backend.mjs <brand>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const brand = process.argv[2];
if (!brand) {
  console.error('usage: node scripts/gen-brand-backend.mjs <brand>');
  process.exit(2);
}

/**
 * Default backend block — the neutral connect default. A brand with no
 * `backend` block resolves to connect-mode with no installer: gact-tui makes
 * NO managed-agent assumption. Projects that ship a managed backend supply an
 * explicit `backend` block in their own brand (see GACT_BRAND_SRC).
 *
 * Kept literally in sync with apps/web/vite-plugin-brand.ts.
 */
const DEFAULT_BACKEND = {
  mode: 'connect',
  sidecarName: '',
  attachPort: 17800,
  attachPortEnv: 'GACT_PORT',
  attachUrlEnv: 'GACT_URL',
  repoLabel: null,
  install: null,
};

/** Resolve a raw "backend" block into a fully-defaulted backend object. */
function resolveBackend(raw) {
  const b = raw.backend;
  if (!b) return DEFAULT_BACKEND;

  let install;
  if (b.install === null) {
    install = null;
  } else if (b.install === undefined) {
    install = DEFAULT_BACKEND.install;
  } else {
    const di = DEFAULT_BACKEND.install;
    install = {
      ref: b.install.ref ?? di.ref,
      refEnv: b.install.refEnv ?? di.refEnv,
      forceEnv: b.install.forceEnv ?? di.forceEnv,
      windowsUrl: b.install.windowsUrl ?? di.windowsUrl,
      unixUrl: b.install.unixUrl ?? di.unixUrl,
      repoLabel: b.install.repoLabel ?? di.repoLabel,
    };
  }

  return {
    mode: b.mode ?? DEFAULT_BACKEND.mode,
    sidecarName: b.sidecarName ?? DEFAULT_BACKEND.sidecarName,
    attachPort: b.attachPort ?? DEFAULT_BACKEND.attachPort,
    attachPortEnv: b.attachPortEnv ?? DEFAULT_BACKEND.attachPortEnv,
    attachUrlEnv: b.attachUrlEnv ?? DEFAULT_BACKEND.attachUrlEnv,
    repoLabel: b.repoLabel ?? null,
    install,
  };
}

// The branding ROOT is the embedding project's responsibility: the agentic system
// that ships gact-tui defines the brand used to compile it, via GACT_BRAND_SRC
// (e.g. clio-agent points this at its own branding/). Falls back to the in-repo
// neutral profiles under apps/branding for the standalone gact shell.
const brandingRoot = process.env.GACT_BRAND_SRC
  ? resolve(process.env.GACT_BRAND_SRC)
  : resolve(__dirname, '../../branding');
const brandPath = resolve(brandingRoot, brand, 'brand.json');
let raw;
try {
  raw = JSON.parse(readFileSync(brandPath, 'utf8'));
} catch (err) {
  console.error(`gen-brand-backend: cannot read brand "${brand}" at ${brandPath}: ${err.message}`);
  process.exit(1);
}

const resolved = resolveBackend(raw);

const outDir = resolve(__dirname, '../src-tauri/gen');
const outPath = resolve(outDir, 'brand-backend.json');
mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, JSON.stringify(resolved, null, 2) + '\n');

console.log(`gen-brand-backend: wrote ${outPath} for brand "${brand}" (mode=${resolved.mode})`);
