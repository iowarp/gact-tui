#!/usr/bin/env node
// Generate src-tauri/gen/brand-backend.json from the selected brand profile.
//
// Also writes src-tauri/gen/tray-template.png next to it: the brand's optional
// "trayTemplate" PNG (a monochrome macOS menu-bar mark, see
// branding/README.md), or an empty file when the brand has none, so the tray
// falls back to the app icon instead of showing another brand's mark.
//
// Reads <brandingRoot>/<profile>/brand.json, extracts and normalizes its
// vocabulary fields (productName, agentName) and its optional "backend"
// block (applying the same defaults as the vite brand plugin), and writes
// the result to src-tauri/gen/brand-backend.json. Rust embeds that file via
// include_str! so the supervisor's backend config and native product/agent
// labels are brand-driven.
//
// The brand is selected by a CONFIG FILE — never an env var. The profile +
// branding root come from the shared resolver (branding/brand-config.mjs),
// which reads brand.config.json (or a brand.config.local.json
// override). Pass `--config <path>` to point at a different config file.
//
// The DEFAULT_BACKEND constant, resolveBackend(), and resolveBrandVocabulary()
// below are duplicated from web/vite-plugin-brand.ts on purpose: a .mjs
// script cannot import the .ts plugin without a build step. Keep the two
// literally in sync.
//
// Usage (run from desktop, the Tauri project dir):
//   node scripts/gen-brand-backend.mjs                 # default config file
//   node scripts/gen-brand-backend.mjs --config <path> # explicit config file
//   node scripts/gen-brand-backend.mjs --out <path>    # override output path
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

/** The agent port when a brand names none. Mirrored by web/vite-plugin-brand.ts. */
const DEFAULT_AGENT_PORT = 17800;

/**
 * Where the agent's port is configured (#739 B7). A brand's `backend.portConfig`
 * names the agent config key, its environment override and the default; the
 * desktop reads the agent's own config file, so the brand is only the fallback.
 * A brand from before `portConfig` keeps its `attachPort`/`attachPortEnv`.
 * Returns `{key, env, default, product, resolver}`: `product` names the agent's
 * config root (clio-paths.yaml) and `resolver` the Python module that prints
 * the resolved port. Mirrored by `resolveAgentPort` in web/vite-plugin-brand.ts.
 */
export function resolvePortConfig(backend) {
  const config = backend?.portConfig;
  const port = Number(config?.default ?? backend?.attachPort ?? DEFAULT_AGENT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`backend.portConfig.default must be a TCP port, got ${port}`);
  }
  const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
  const resolver = text(config?.resolver)?.match(/-m\s+([\w.]+)/)?.[1] ?? null;
  return {
    key: text(config?.key),
    env: text(config?.env) ?? text(backend?.attachPortEnv),
    default: port,
    product: config ? (text(config.product) ?? text(backend?.sidecarName)) : null,
    resolver,
  };
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
  portConfig: {
    key: null,
    env: null,
    default: DEFAULT_AGENT_PORT,
    product: null,
    resolver: null,
  },
  attachUrlEnv: 'GACT_URL',
  repoLabel: null,
  install: null,
};

/**
 * Resolve the brand-vocabulary fields (`productName`, `agentName`) a raw
 * brand.json declares, applying the SAME defaults as
 * `web/vite-plugin-brand.ts`'s `loadBrand` (`productName` -> `${name}
 * Desktop`, `agentName` -> `name`). Duplicated on purpose — see the module
 * doc comment; keep both literally in sync. `workspaceNoun` has no native
 * consumer today, so it is resolved by the web plugin only.
 */
export function resolveBrandVocabulary(raw, profile) {
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : profile;
  return {
    productName: raw.productName?.trim() || `${name} Desktop`,
    agentName: raw.agentName?.trim() || name,
  };
}

/** Resolve a raw "backend" block into a fully-defaulted backend object. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * The brand's macOS menu-bar template image, or an empty buffer when the brand
 * declares none. `trayTemplate` is a PNG path relative to the profile folder;
 * only its alpha channel is used, so it should be a black mark on transparency.
 */
export function resolveTrayTemplate(raw, profileDir) {
  const relative = raw?.trayTemplate;
  if (relative === undefined) return Buffer.alloc(0);
  if (typeof relative !== 'string' || !relative.trim()) {
    throw new Error('"trayTemplate" must be a PNG path relative to the brand folder');
  }
  const path = resolve(profileDir, relative);
  const bytes = readFileSync(path);
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`"trayTemplate" ${path} is not a PNG image`);
  }
  return bytes;
}

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
    portConfig: resolvePortConfig(b),
    attachUrlEnv: b.attachUrlEnv ?? DEFAULT_BACKEND.attachUrlEnv,
    repoLabel: b.repoLabel ?? null,
    install,
  };
}

/**
 * Parse CLI argv into `{ configPath, outPathArg }`. No positional brand
 * arg — the brand is always config-file-selected. Exits the process
 * directly for `--help` and argument errors, matching the script's
 * pre-existing CLI contract.
 */
function parseArgv(argv) {
  let configPath;
  let outPathArg;
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
  return { configPath, outPathArg };
}

// Everything below runs ONLY when this file is executed directly (`node
// scripts/gen-brand-backend.mjs ...`), never on import — resolveBrandVocabulary
// and resolveBackend are pure functions meant to be imported (e.g. by
// desktop/tests/gen-brand-backend.test.mjs); importing this module must
// never read the local brand config or write gen/brand-backend.json as a
// side effect.
function main(argv) {
  const { configPath, outPathArg } = parseArgv(argv);

  let profile;
  let brandingRoot;
  try {
    ({ profile, brandingRoot } = resolveBrandConfig(configPath));
  } catch (err) {
    console.error(`gen-brand-backend: ${err.message}`);
    process.exit(1);
  }

  // `profile` + `brandingRoot` come from the config-file resolver above. The
  // branding ROOT is the embedding project's responsibility: the agentic
  // system that ships gact-tui defines the brand used to compile it via its
  // brand.config.local.json (e.g. clio-agent points brandingRoot at its own
  // branding/). The standalone gact shell uses the tracked root
  // brand.config.json (profile "gact", brandingRoot "branding").
  const brandPath = resolve(brandingRoot, profile, 'brand.json');
  let raw;
  try {
    raw = JSON.parse(readFileSync(brandPath, 'utf8'));
  } catch (err) {
    console.error(
      `gen-brand-backend: cannot read brand "${profile}" at ${brandPath}: ${err.message}`,
    );
    process.exit(1);
  }

  const resolved = {
    ...resolveBrandVocabulary(raw, profile),
    ...resolveBackend(raw),
  };

  const outPath = outPathArg
    ? resolve(outPathArg)
    : resolve(__dirname, '../src-tauri/gen/brand-backend.json');
  let trayTemplate;
  try {
    trayTemplate = resolveTrayTemplate(raw, dirname(brandPath));
  } catch (err) {
    console.error(`gen-brand-backend: brand "${profile}": ${err.message}`);
    process.exit(1);
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(resolved, null, 2) + '\n');
  writeFileSync(resolve(dirname(outPath), 'tray-template.png'), trayTemplate);

  console.log(`gen-brand-backend: wrote ${outPath} for brand "${profile}" (mode=${resolved.mode})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
