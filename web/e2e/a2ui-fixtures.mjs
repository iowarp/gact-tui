import { readFileSync } from 'node:fs';
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
 * `and(email(/email), length(/password, min:8))` — and is left byte-for-byte
 * untouched (it is checksum-tracked in manifest.json). But
 * `@a2ui/web_core@0.10.6`'s `and`/`or` implementations do not recursively
 * resolve nested `{call, args}` conditions inside their `values` array before
 * testing truthiness, so a NESTED function call is always truthy and
 * `and(...)` always evaluates `true` regardless of its operands (confirmed
 * with the real library, no app code involved: `and(email(""), length("",
 * min:8))` resolves `true` even though each operand alone resolves `false`).
 * That upstream defect is out of scope for this CI fix (bumping
 * `@a2ui/web_core` is a separate, larger change). At RUNTIME ONLY — for this
 * e2e fixture, never touching the vendored file — the compound check is
 * swapped for two independent CheckRules with the same two conditions, which
 * this library resolves correctly, so the smoke spec can still prove "Button
 * disabled until its checks pass" end to end.
 */
export function loginFormExampleMessages() {
  const messages = structuredClone(readJson('examples/09_login-form.json').messages);
  for (const message of messages) {
    const components = message.updateComponents?.components;
    if (!Array.isArray(components)) continue;
    const loginButton = components.find((component) => component.id === 'login-btn');
    if (!loginButton) continue;
    loginButton.checks = [
      {
        condition: { call: 'email', args: { value: { path: '/email' } } },
        message: 'Please enter a valid email address',
      },
      {
        condition: { call: 'length', args: { value: { path: '/password' }, min: 8 } },
        message: 'Password must be at least 8 characters long',
      },
    ];
  }
  return messages;
}
