// Visual-suite brand selector — NON-DESTRUCTIVE to a developer's local brand.
//
// The visual suite bakes the CLIO brand into the build by writing
// `apps/brand.config.local.json` (the gitignored override that
// `apps/branding/brand-config.mjs` always prefers). A developer may ALREADY
// have that file pointing at their real brand — so blindly overwriting it, as
// this script used to, leaves the developer branded with the test placeholder
// after the suite finishes (the "C" placeholder logo papercut).
//
// This module therefore has two modes and is safe to reuse as the Playwright
// visual-suite `globalTeardown`:
//   - SETUP  (default, run by the `webServer` command): back up any existing
//     `brand.config.local.json` exactly once, then write the test pointer.
//   - RESTORE (the default export, or the `restore` CLI arg): put the
//     developer's original config back (or remove the test-only file we
//     created), leaving the workspace exactly as we found it.
//
// Wiring: `webServer.command` runs this as a CLI for SETUP; add
// `globalTeardown: './tests/visual/write-brand-config.mjs'` to the Playwright
// config (or run `node tests/visual/write-brand-config.mjs restore`) to RESTORE
// when the suite ends.
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  rmSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(import.meta.dirname, '..', '..', '..');
const externalClioRoot = resolve(appRoot, '..', '..', '..', 'clio-agent', 'branding');
const generatedRoot = resolve(appRoot, '.generated-branding');

const localConfigPath = resolve(appRoot, 'brand.config.local.json');
// Sidecar files that let RESTORE undo SETUP. Both are transient harness state;
// they sit next to the (gitignored) local config and are cleaned up on restore.
const backupPath = resolve(appRoot, 'brand.config.local.json.harness-bak');
const statePath = resolve(appRoot, '.brand-config.harness-state.json');

function ensureGeneratedClioBrand() {
  const profileDir = resolve(generatedRoot, 'clio');
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(
    resolve(profileDir, 'brand.json'),
    `${JSON.stringify(
      {
        name: 'CLIO',
        wordmark: 'CLIO',
        tagline: 'by the Gnosis Research Center',
        taglineAccent: 'Gnosis Research Center',
        homeUrl: 'https://iowarp.ai',
        taglineAccentUrl: 'https://grc.iit.edu',
        markGlyph: 'C',
        logoSvg: 'logo.svg',
        accent: '#ea7b2a',
        themeTokens: { '--color-accent': '#ea7b2a' },
        backendRepository: {
          label: 'github.com/iowarp/clio-agent',
          url: 'https://github.com/iowarp/clio-agent',
          detail: 'CLIO backend',
        },
        backend: {
          mode: 'managed',
          sidecarName: 'clio-agent',
          attachPort: 17800,
          attachPortEnv: 'CLIO_PORT',
          attachUrlEnv: 'CLIO_GACT_URL',
          install: {
            ref: 'develop',
            refEnv: 'CLIO_REF',
            forceEnv: 'CLIO_FORCE',
            windowsUrl: 'https://raw.githubusercontent.com/iowarp/clio-agent/main/install/install.ps1',
            unixUrl: 'https://raw.githubusercontent.com/iowarp/clio-agent/main/install/install.sh',
            repoLabel: 'github.com/iowarp/clio-agent',
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    resolve(profileDir, 'logo.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#000"/><text x="32" y="40" text-anchor="middle" font-family="monospace" font-size="28" font-weight="700" fill="#ea7b2a">C</text></svg>\n',
  );
  return generatedRoot;
}

/**
 * Whether SETUP recorded a pre-existing developer config. Reads the
 * `hadOriginal` flag from the harness state file; on a corrupt/unreadable state
 * file it falls back to the backup's existence — a backup is only ever written
 * when there was a real original to preserve, so it is a safe proxy for the
 * flag. Returns `false` when there is no state file at all.
 *
 * @returns {boolean}
 */
function stateHadOriginal() {
  if (!existsSync(statePath)) return false;
  try {
    return JSON.parse(readFileSync(statePath, 'utf8')).hadOriginal === true;
  } catch {
    return existsSync(backupPath);
  }
}

/**
 * SETUP: back up any pre-existing local brand config, then write the test
 * pointer for `profile`. The backup is captured exactly once (guarded by the
 * state file), so repeated harness runs never mistake our own test pointer for
 * the developer's original.
 *
 * @param {string} profile Brand profile id (default `clio`).
 */
export function writeBrandConfig(profile = 'clio') {
  const brandingRoot =
    profile === 'clio'
      ? existsSync(resolve(externalClioRoot, 'clio', 'brand.json'))
        ? externalClioRoot
        : ensureGeneratedClioBrand()
      : 'branding';

  // Preserve the developer's pristine config the first time we run, so RESTORE
  // can put it back verbatim. If the state file already exists we are mid-suite
  // (or recovering from a prior run), so the current file is OUR test pointer —
  // do not re-capture it.
  if (!existsSync(statePath)) {
    if (existsSync(localConfigPath)) {
      copyFileSync(localConfigPath, backupPath);
      writeFileSync(statePath, `${JSON.stringify({ hadOriginal: true })}\n`);
    } else {
      writeFileSync(statePath, `${JSON.stringify({ hadOriginal: false })}\n`);
    }
  } else if (!existsSync(backupPath) && stateHadOriginal()) {
    // Corruption guard: the state file records a real original, but its backup
    // has vanished. The one way this happens is a crash between RESTORE's two
    // rmSync calls — the backup was deleted but the state file survived, and
    // RESTORE had already copied the original back into localConfigPath. So the
    // developer's original is sitting in localConfigPath RIGHT NOW, about to be
    // clobbered by the test pointer below. Re-capture it first so RESTORE can
    // still recover it — otherwise this SETUP would silently lose it. (A
    // hadOriginal:false session never had a backup, so it is skipped here.)
    if (existsSync(localConfigPath)) {
      copyFileSync(localConfigPath, backupPath);
    }
  }

  writeFileSync(localConfigPath, `${JSON.stringify({ profile, brandingRoot }, null, 2)}\n`);
}

/**
 * RESTORE: undo SETUP, leaving the workspace exactly as it was found. Restores
 * the developer's backed-up config, or removes the test-only file we created
 * when there was no original. A no-op when SETUP never ran.
 */
export function restoreBrandConfig() {
  if (!existsSync(statePath)) return; // nothing to undo

  const hadOriginal = stateHadOriginal();

  if (hadOriginal) {
    if (!existsSync(backupPath)) {
      // The state records a real original but its backup is gone. Do NOT no-op:
      // silently returning here would leave localConfigPath on the CLIO test
      // pointer and strand the developer on the placeholder brand — the exact
      // data-loss papercut. SETUP re-captures the backup on its next run, so
      // reaching here means RESTORE was invoked without a preceding SETUP;
      // surface it loudly (and leave the state file intact for recovery)
      // instead of quietly overwriting the developer's config.
      throw new Error(
        `Brand-config restore: harness state records an original brand config ` +
          `but its backup (${backupPath}) is missing. Refusing to silently ` +
          `overwrite ${localConfigPath}. Re-run the visual suite (SETUP ` +
          `re-captures the backup) or restore the file from version control.`,
      );
    }
    copyFileSync(backupPath, localConfigPath);
  } else if (existsSync(localConfigPath)) {
    // No original existed — remove the test-only pointer we created.
    rmSync(localConfigPath);
  }

  if (existsSync(backupPath)) rmSync(backupPath);
  rmSync(statePath);
}

// Default export so this module can be used directly as a Playwright
// `globalTeardown` (Playwright imports the module and awaits its default).
export default async function globalTeardown() {
  restoreBrandConfig();
}

// CLI entrypoint — only when executed directly (not when imported as the
// globalTeardown module), so importing it never triggers a SETUP write.
const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const arg = process.argv[2];
  if (arg === 'restore' || arg === '--restore') {
    restoreBrandConfig();
  } else {
    writeBrandConfig(arg || 'clio');
  }
}
