import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Vendored catalog files/sidecars and the official example corpus — the same
// bytes web/src/test-fixtures/a2ui/v0_9_1/ uses for unit tests, reused here
// so the Playwright fixture server answers the S2/S3 shapes with real data
// instead of an invented one (S6 adversarial review item 2b).

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES_ROOT = resolve(here, '../src/test-fixtures/a2ui/v0_9_1');

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(FIXTURES_ROOT, relativePath), 'utf8'));
}

const basicFile = readJson('catalogs/basic/catalog.json');
const basicSidecar = readJson('catalogs/basic/catalog.clio.json');
const workspaceFile = readJson('catalogs/clio-workspace/v1/catalog.json');
const workspaceSidecar = readJson('catalogs/clio-workspace/v1/catalog.clio.json');
const manifest = readJson('manifest.json');

/** Mirrors gact/a2ui_catalogs/routes/a2ui_catalogs.py::_catalog_row (S2/S6). */
function catalogRow(file, sidecar, checksum, instructions) {
  return {
    catalogId: file.catalogId,
    protocolVersion: sidecar.protocolVersion,
    source: 'builtin',
    checksum,
    componentNames: Object.keys(file.components ?? {}).sort(),
    functionNames: Object.keys(file.functions ?? {}).sort(),
    sidecar,
    producible: true,
    file,
    instructions,
  };
}

/** `GET /v1/sessions/{sid}/a2ui/catalogs` — both builtins, always producible in the fixture. */
export function a2uiCatalogRows() {
  return [
    catalogRow(
      workspaceFile,
      workspaceSidecar,
      manifest.catalogs['catalogs/clio-workspace/v1/catalog.json'],
      'Renders CLIO scientific workspace components.',
    ),
    catalogRow(
      basicFile,
      basicSidecar,
      manifest.catalogs['catalogs/basic/catalog.json'],
      'Renders the official A2UI Basic catalog components.',
    ),
  ];
}

/**
 * `GET /v1/sessions/{sid}/a2ui/capabilities` — mirrors
 * gact/a2ui_capabilities.py's response shape (docs/gact/a2ui-binding.md).
 */
export function a2uiCapabilities() {
  const supportedCatalogIds = [workspaceFile.catalogId, basicFile.catalogId];
  return {
    agent: { 'v0.9': { supportedCatalogIds, acceptsInlineCatalogs: false } },
    client: null,
    selection: {
      catalog_id: null,
      reason: 'a2ui_client_capabilities_unknown',
      client_supported_catalog_ids: [],
      producible_catalog_ids: supportedCatalogIds,
    },
  };
}

/**
 * One official Basic-catalog example's `messages`, from the vendored corpus
 * (web/src/test-fixtures/a2ui/v0_9_1/examples/). Used to build a full
 * A2UISurface fixture record for the Playwright A2UI smoke spec.
 *
 * The vendored example's own `login-btn` gates on one compound check —
 * `and(email(/email), length(/password, min:8))` — returned byte-for-byte
 * untouched (it is checksum-tracked in manifest.json).
 *
 * S6 found that `@a2ui/web_core@0.10.6`'s `and`/`or` implementations do not
 * recursively resolve nested `{call, args}` conditions inside their `values`
 * array before testing truthiness, so a NESTED function call was always
 * truthy and `and(...)` always evaluated `true` regardless of its operands.
 * At RUNTIME ONLY the compound check was swapped for two independent
 * CheckRules with the same two conditions so the smoke spec could still
 * prove "Button disabled until its checks pass" end to end.
 *
 * S8 (0.11.x upgrade) re-verified this with the same standalone repro
 * pattern (`DataContext.resolveDynamicValue` against a minimal `Catalog` +
 * `BASIC_FUNCTIONS`, no app code): `and(email(""), length("", min:8))` now
 * correctly resolves `false` (each operand does too), and the same compound
 * resolves `true` once both operands are valid — the upstream defect is
 * FIXED in `@a2ui/web_core@0.11.0`. The workaround is removed; this now
 * returns the vendored example unmodified.
 */
export function loginFormExampleMessages() {
  return structuredClone(readJson('examples/09_login-form.json').messages);
}

/** The Basic catalog's own id, as vendored (`catalogs/basic/catalog.json`). */
export const BASIC_A2UI_CATALOG_ID = basicFile.catalogId;

/**
 * The 43 official Basic-catalog examples' `{file, messages}` pairs, sorted by
 * filename — the same corpus `web/src/test-fixtures/a2ui/v0_9_1/fixtures.ts`
 * exposes to vitest (`A2UI_BASIC_EXAMPLES`) as a Vite `import.meta.glob`, read
 * here with plain `fs` since this file runs as a standalone Node script, not
 * through Vite. Used by the desktop JS smoke (S8 gact-tui#409 item 3) to
 * prove the packaged bundle renders every example, not just the login form.
 */
export function allExampleMessages() {
  return readdirSync(resolve(FIXTURES_ROOT, 'examples'))
    .filter((name) => name.endsWith('.json') && name !== 'SOURCE.json')
    .sort()
    .map((file) => ({ file, messages: readJson(`examples/${file}`).messages }));
}
