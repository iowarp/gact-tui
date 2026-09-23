import type { A2uiCatalogRow } from '@clio/core/v3';
import { vocab } from '@/lib/brand-vocabulary';
import basicCatalogFile from './catalogs/basic/catalog.json';
import basicCatalogSidecar from './catalogs/basic/catalog.clio.json';
import clioWorkspaceCatalogFile from './catalogs/clio-workspace/v1/catalog.json';
import clioWorkspaceCatalogSidecar from './catalogs/clio-workspace/v1/catalog.clio.json';
import manifest from './manifest.json';

/**
 * Vendored copies of the official Basic catalog and CLIO's own workspace
 * catalog (clio-schemas 0.3.0, commit `manifest.commit`), shaped exactly like
 * one row of `GET /v1/sessions/{sid}/a2ui/catalogs`
 * (`gact/a2ui_catalogs/routes/a2ui_catalogs.py::_catalog_row`) — for tests
 * that need a realistic registry input without a live server.
 */
export const BASIC_CATALOG_ROW: A2uiCatalogRow = {
  catalogId: basicCatalogFile.catalogId,
  protocolVersion: basicCatalogSidecar.protocolVersion,
  source: 'builtin',
  checksum: manifest.catalogs['catalogs/basic/catalog.json'],
  componentNames: Object.keys(basicCatalogFile.components),
  functionNames: Object.keys(basicCatalogFile.functions ?? {}),
  sidecar: basicCatalogSidecar as A2uiCatalogRow['sidecar'],
  producible: true,
  file: basicCatalogFile as A2uiCatalogRow['file'],
  instructions: 'Renders the official A2UI Basic catalog components.',
};

export const CLIO_WORKSPACE_CATALOG_ROW: A2uiCatalogRow = {
  catalogId: clioWorkspaceCatalogFile.catalogId,
  protocolVersion: clioWorkspaceCatalogSidecar.protocolVersion,
  source: 'builtin',
  checksum: manifest.catalogs['catalogs/clio-workspace/v1/catalog.json'],
  componentNames: Object.keys(clioWorkspaceCatalogFile.components),
  functionNames: Object.keys(clioWorkspaceCatalogFile.functions ?? {}),
  sidecar: clioWorkspaceCatalogSidecar as A2uiCatalogRow['sidecar'],
  producible: true,
  file: clioWorkspaceCatalogFile as A2uiCatalogRow['file'],
  instructions: `Renders ${vocab.agent} scientific workspace components.`,
};

export const CLIO_A2UI_CATALOG_ID = CLIO_WORKSPACE_CATALOG_ROW.catalogId;
export const BASIC_A2UI_CATALOG_ID = BASIC_CATALOG_ROW.catalogId;

interface ExampleFixture {
  name: string;
  description: string;
  messages: unknown[];
}

const exampleModules = import.meta.glob<{ default: ExampleFixture }>(
  ['./examples/*.json', '!./examples/SOURCE.json'],
  { eager: true },
);

/** The 43 official Basic-catalog examples, sorted by their vendored filename. */
export const A2UI_BASIC_EXAMPLES: Array<{ file: string } & ExampleFixture> = Object.entries(
  exampleModules,
)
  .map(([file, mod]) => ({ file, ...mod.default }))
  .sort((a, b) => a.file.localeCompare(b.file));
