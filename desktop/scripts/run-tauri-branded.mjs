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
// Usage (invoked via package.json's tauri:dev / tauri:build* scripts, AND via
// the plain `tauri` script — desktop/package.json points "tauri" at this file
// rather than the raw CLI, so an external caller that invokes
// `pnpm --filter @clio/desktop tauri build --config <path>` — e.g.
// clio-agent's bundles workflow, unchanged — still gets the brand overlay and
// the macOS traffic-light overlay folded in):
//   node scripts/run-tauri-branded.mjs <tauri-args...> [--config <path>] [--merge-config <path>...]
//
// A caller-supplied `--config <path>` is NOT forwarded to the real Tauri CLI
// as-is: the Tauri CLI rejects more than one `--config` flag, and this
// wrapper always computes and passes its OWN single merged `--config`. So a
// caller's `--config` is extracted from the forwarded args and folded into
// the SAME overlay chain as the brand overlay and `--merge-config` paths,
// with the macOS overlay (when running on darwin) always merged in LAST —
// see resolveOverlayPaths.
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

// `app.windows` is the ONE array in the whole config that is element-wise
// mergeable (a list of window configs, each independently patchable, so two
// overlays can each patch fields on the SAME window entry — e.g. a brand
// overlay setting title/identifier and the macOS overlay setting
// decorations/titleBarStyle — without clobbering one another; see
// tauri.macos.conf.json and resolveOverlayPaths). This is deliberately keyed
// on the EXACT path, not "any array of plain objects" — every other array in
// a Tauri config (icon lists, bundle targets, CSP origins, and any array
// this config shape gains later) stays RFC 7396 merge-patch: the overlay
// replaces the base array wholesale, since outside app.windows there is no
// "same object, different overlay" relationship to reconcile index-by-index.
const ELEMENT_WISE_MERGE_PATH = 'app.windows';

function isMergeableObjectArray(value) {
  return (
    value.length > 0 &&
    value.every((item) => item !== null && typeof item === 'object' && !Array.isArray(item))
  );
}

export function mergeConfig(base, overlay, path = []) {
  if (
    base === null ||
    overlay === null ||
    typeof base !== 'object' ||
    typeof overlay !== 'object'
  ) {
    return overlay;
  }
  if (Array.isArray(base) || Array.isArray(overlay)) {
    if (
      path.join('.') === ELEMENT_WISE_MERGE_PATH &&
      Array.isArray(base) &&
      Array.isArray(overlay) &&
      isMergeableObjectArray(base) &&
      isMergeableObjectArray(overlay)
    ) {
      return base
        .map((item, index) =>
          index in overlay ? mergeConfig(item, overlay[index], [...path, String(index)]) : item,
        )
        .concat(overlay.slice(base.length));
    }
    return overlay;
  }

  const merged = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    merged[key] = key in merged ? mergeConfig(merged[key], value, [...path, key]) : value;
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

/** Merge an ordered list of overlay files (each read fresh) into one object. */
export function mergeOverlayPaths(paths) {
  return paths.reduce((current, path) => mergeConfig(current, readJson(path)), {});
}

export function materializeMergedOverlay(paths, outputPath) {
  const merged = mergeOverlayPaths(paths);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(merged, null, 2)}\n`);
  return outputPath;
}

/**
 * Split the wrapper's argv into the args to forward to the real Tauri CLI
 * and the extra overlay paths a caller supplied.
 *
 * Two ways to supply an extra overlay, both folded into the same ordered
 * list (in the order they appear): a `--config <path>` pair anywhere in the
 * args (this is what an external caller such as clio-agent's bundles
 * workflow passes — `tauri build --config "$cfg"` — and what Tauri itself
 * would accept, but we intercept it rather than forwarding it because Tauri
 * rejects a SECOND `--config` once this wrapper adds its own), or the legacy
 * `--merge-config <path>...` trailing list (used by the tauri:build:bundled
 * script). `--config`'s value is removed from `tauriArgs` either way; the
 * wrapper always computes and passes its own single `--config`.
 */
export function parseArgv(argv) {
  const mergeSeparator = argv.indexOf('--merge-config');
  const head = mergeSeparator >= 0 ? argv.slice(0, mergeSeparator) : argv;
  const mergeConfigPaths = mergeSeparator >= 0 ? argv.slice(mergeSeparator + 1) : [];

  const tauriArgs = [];
  const extraOverlayPaths = [];
  for (let i = 0; i < head.length; i += 1) {
    if (head[i] === '--config') {
      const value = head[i + 1];
      if (!value) throw new Error('--config requires a path');
      extraOverlayPaths.push(value);
      i += 1;
      continue;
    }
    tauriArgs.push(head[i]);
  }
  extraOverlayPaths.push(...mergeConfigPaths);

  if (tauriArgs.length === 0) {
    throw new Error('Expected a Tauri command such as dev or build.');
  }
  return { tauriArgs, extraOverlayPaths };
}

/**
 * Build the ordered overlay chain for a run: the brand's own native overlay
 * first, then any caller-supplied overlays (argv order), then — on darwin
 * only — tauri.macos.conf.json LAST.
 *
 * macOS keeps its native traffic lights (decorations: true + titleBarStyle:
 * Overlay), which every brand's own overlay leaves at decorations: false —
 * so the macOS overlay must be merged in LAST, after everything else, or an
 * earlier overlay's full `windows` entry would win outright (mergeConfig's
 * element-wise array merge notwithstanding — LAST still wins per field) and
 * silently strip the traffic lights back out on macOS. This must hold
 * regardless of what a CALLER's own `--config` overlay sets, which is why
 * the macOS overlay is appended here rather than left to the caller.
 */
export function resolveOverlayPaths({ extraOverlayPaths, platform, brandConfigPath }) {
  const brandOverlay = resolveNativeBrandOverlay(brandConfigPath);
  const macosOverlay = platform === 'darwin' ? resolve(tauriDir, 'tauri.macos.conf.json') : null;
  return [brandOverlay, ...extraOverlayPaths.map((path) => resolve(path)), macosOverlay].filter(
    Boolean,
  );
}

function main(argv) {
  const { tauriArgs, extraOverlayPaths } = parseArgv(argv);
  const overlays = resolveOverlayPaths({ extraOverlayPaths, platform: process.platform });
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
