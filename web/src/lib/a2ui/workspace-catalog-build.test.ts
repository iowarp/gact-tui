import { buildA2uiCatalog } from '@clio/core/v3';
import { expect, it } from 'vitest';
import { CLIO_WORKSPACE_CATALOG_ROW } from '@/test-fixtures/a2ui/v0_9_1/fixtures';
import { KERNEL_COMPONENTS, KERNEL_FUNCTIONS } from './kernel-catalog';

it('builds the current workspace catalog, whose functions include openView', () => {
  expect(Object.keys(CLIO_WORKSPACE_CATALOG_ROW.file?.functions ?? {})).toContain('openView');
  const built = buildA2uiCatalog(CLIO_WORKSPACE_CATALOG_ROW, {
    components: KERNEL_COMPONENTS,
    functions: KERNEL_FUNCTIONS,
  });
  expect(built.ok ? 'built' : built.reason).toBe('built');
});
