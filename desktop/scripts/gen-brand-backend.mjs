#!/usr/bin/env node
// Generate src-tauri/gen/brand-backend.json from the selected brand profile.
//
// Reads <brandingRoot>/<profile>/brand.json, extracts and normalizes its
// optional "backend" block (applying the same defaults as the vite brand
// plugin), and writes the result to src-tauri/gen/brand-backend.json. Rust
// embeds that file via include_str! so the supervisor's backend config is
// brand-driven.
//
// The brand is selected by a CONFIG FILE — never an env var. The profile +
// branding root come from the shared resolver (branding/brand-config.mjs),
// which reads brand.config.json (or a brand.config.local.json
// override). Pass `--config <path>` to point at a different config file.
//
// The DEFAULT_BACKEND constant and resolveBackend() below are duplicated from
// web/vite-plugin-brand.ts on purpose: a .mjs script cannot import the
// .ts plugin without a build step. Keep the two literally in sync.
//
// Usage (run from desktop, the Tauri project dir):
//   node scripts/gen-brand-backend.mjs                 # default config file
//   node scripts/gen-brand-backend.mjs --config <path> # explicit config file
//   node scripts/gen-brand-backend.mjs --out <path>    # override output path
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { resolveBrandConfig } from '../../branding/brand-config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function usage() {
  console.log(
    [
      'Generate src-tauri/gen/brand-backend.json from the config-selected brand.',
      '',
      'Usage:',
      '  node scripts/gen-brand-backend.mjs [--config <path>] [--out <path>]',
      '',
      'Options:',
      '  --config <path>  Brand config file (default: brand.config.json,',
      '                   or brand.config.local.json when present).',
      '  --out <path>     Output JSON path (default: src-tauri/gen/brand-backend.json).',
      '  -h, --help       Show this message.',
      '',
      'The brand is selected by the config file, NOT an env var.',
    ].join('\n'),
  );
}

// --- Parse explicit flags (no positional brand arg) -----------------------
let configPath;
let outPathArg;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === '-h' || arg === '--help') {
    usage();
    process.exit(0);
  } else if (arg === '--config') {
    configPath = argv[i + 1];
    i += 1;
    if (!configPath) {
      console.error('gen-brand-backend: --config requires a path');
      process.exit(2);
    }
  } else if (arg === '--out') {
    outPathArg = argv[i + 1];
    i += 1;
    if (!outPathArg) {
      console.error('gen-brand-backend: --out requires a path');
      process.exit(2);
    }
  } else {
    console.error(`gen-brand-backend: unknown argument "${arg}"`);
    usage();
    process.exit(2);
  }
}

let profile;
let brandingRoot;
try {
  ({ profile, brandingRoot } = resolveBrandConfig(configPath));
} catch (err) {
  console.error(`gen-brand-backend: ${err.message}`);
  process.exit(1);
}

/**
 * Default backend block — the neutral connect default. A brand with no
 * `backend` block resolves to connect-mode with no installer: gact-tui makes
 * NO managed-agent assumption. Projects that ship a managed backend supply an
 * explicit `backend` block in their own brand (selected via the config file).
 *
 * Kept in sync with the desktop supervisor contract.
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
    const di = DEFAULT_BACKEND.install ?? {
      ref: 'main',
      refEnv: 'GACT_REF',
      forceEnv: 'GACT_FORCE',
      windowsUrl: '',
      unixUrl: '',
      repoLabel: 'the configured backend',
    };
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

// `profile` + `brandingRoot` come from the config-file resolver above. The
// branding ROOT is the embedding project's responsibility: the agentic system
// that ships gact-tui defines the brand used to compile it via its
// brand.config.local.json (e.g. clio-agent points brandingRoot at its own
// branding/). The standalone gact shell uses the tracked apps/brand.config.json
// (profile "gact", brandingRoot "branding").
const brandPath = resolve(brandingRoot, profile, 'brand.json');
let raw;
try {
  raw = JSON.parse(readFileSync(brandPath, 'utf8'));
} catch (err) {
  console.error(`gen-brand-backend: cannot read brand "${profile}" at ${brandPath}: ${err.message}`);
  process.exit(1);
}

const resolved = resolveBackend(raw);

const outPath = outPathArg
  ? resolve(outPathArg)
  : resolve(__dirname, '../src-tauri/gen/brand-backend.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(resolved, null, 2) + '\n');

console.log(`gen-brand-backend: wrote ${outPath} for brand "${profile}" (mode=${resolved.mode})`);
