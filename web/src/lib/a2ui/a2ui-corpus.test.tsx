import { A2uiCatalogRegistry } from '@clio/core/v3';
import { renderMarkdown } from '@a2ui/markdown-it';
import { MarkdownContext } from '@a2ui/react/v0_9';
import { MessageProcessor, type A2uiMessage } from '@a2ui/web_core/v0_9';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { A2UI_BASIC_EXAMPLES, BASIC_CATALOG_ROW } from '@/test-fixtures/a2ui/v0_9_1/fixtures';
import { A2uiSurface, KERNEL_COMPONENTS, KERNEL_FUNCTIONS } from './kernel-catalog';
import { wrapKernelComponentWithPresets } from './kernel-presets';

afterEach(cleanup);

/**
 * The 43 official Basic-catalog examples (vendored from clio-schemas 0.3.0's
 * corpus, byte-identical per `manifest.json`) render through THIS renderer's
 * own registry pipeline — not a hand-built `Catalog` — proving the kernel
 * fully implements the official Basic catalog end to end
 * (docs/design/a2ui-compat-campaign-2026-09.md S6 deliverable 8).
 */
describe('A2UI Basic-catalog corpus (43 official examples)', () => {
  expect(A2UI_BASIC_EXAMPLES).toHaveLength(43);

  const registry = new A2uiCatalogRegistry(
    { components: KERNEL_COMPONENTS, functions: KERNEL_FUNCTIONS },
    wrapKernelComponentWithPresets,
  );
  registry.load([BASIC_CATALOG_ROW]);
  const catalog = registry.get(BASIC_CATALOG_ROW.catalogId);
  if (!catalog) {
    throw new Error(
      `Expected the Basic catalog to resolve against the kernel: ${JSON.stringify(
        registry.reasonFor(BASIC_CATALOG_ROW.catalogId),
      )}`,
    );
  }

  it.each(A2UI_BASIC_EXAMPLES.map((example) => [example.file, example] as const))(
    'renders %s with no React error',
    (_file, example) => {
      const processor = new MessageProcessor([catalog], async () => undefined, { version: 'v0.9' });
      processor.processMessages(example.messages as A2uiMessage[]);

      const first = example.messages[0] as { createSurface?: { surfaceId?: string } };
      const surfaceId = first.createSurface?.surfaceId;
      expect(surfaceId, `${example.name} must open with a createSurface message`).toBeTruthy();
      const surface = processor.model.getSurface(surfaceId!);
      expect(surface, `${example.name} did not create its declared surface`).toBeDefined();

      const { container } = render(
        <MarkdownContext.Provider value={renderMarkdown}>
          <A2uiSurface surface={surface!} />
        </MarkdownContext.Provider>,
      );
      expect(container).not.toBeEmptyDOMElement();
      expect(container.textContent).not.toMatch(/Unknown component/u);
    },
  );
});
