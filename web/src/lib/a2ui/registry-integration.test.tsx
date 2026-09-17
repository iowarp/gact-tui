import { A2uiCatalogRegistry } from '@clio/core/v3';
import type { A2uiCatalogRow } from '@clio/core/v3';
import { renderMarkdown } from '@a2ui/markdown-it';
import { MarkdownContext } from '@a2ui/react/v0_9';
import { MessageProcessor, type A2uiMessage } from '@a2ui/web_core/v0_9';
import type { ReactComponentImplementation } from '@a2ui/react/v0_9';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { afterEach, describe, expect, it } from 'vitest';
import { A2UI_BASIC_EXAMPLES, BASIC_CATALOG_ROW } from '@/test-fixtures/a2ui/v0_9_1/fixtures';
import { A2uiSurface, KERNEL_COMPONENTS, KERNEL_FUNCTIONS } from './kernel-catalog';
import { wrapKernelComponentWithPresets } from './kernel-presets';

afterEach(cleanup);

const KERNEL = { components: KERNEL_COMPONENTS, functions: KERNEL_FUNCTIONS };

/**
 * A minimal pack row: aliases the official ChoicePicker under a pack-chosen
 * name, presetting `variant: multipleSelection` (S6 adversarial review item
 * 7). Mirrors the shape `GET /v1/sessions/{sid}/a2ui/catalogs` returns.
 */
const PACK_ROW: A2uiCatalogRow = {
  catalogId: 'https://packs.example/earthscope/v1',
  protocolVersion: '0.9.1',
  source: 'blueprint',
  checksum: 'pack-checksum',
  componentNames: ['MultiPicker'],
  functionNames: [],
  sidecar: {
    catalogId: 'https://packs.example/earthscope/v1',
    protocolVersion: '0.9.1',
    trust: { source: 'pack' },
    implements: {
      MultiPicker: { kernel: 'ChoicePicker', presets: { variant: 'multipleSelection' } },
    },
  },
  producible: true,
  file: {
    catalogId: 'https://packs.example/earthscope/v1',
    components: { MultiPicker: {} },
  },
};

describe('a pack row aliasing ChoicePicker with presets (S6 item 7)', () => {
  it('renders a multi-select: options are checkboxes and stay independently selectable', async () => {
    const user = userEvent.setup();
    const registry = new A2uiCatalogRegistry<ReactComponentImplementation>(
      KERNEL,
      wrapKernelComponentWithPresets,
    );
    registry.load([PACK_ROW]);
    const catalog = registry.get(PACK_ROW.catalogId);
    expect(catalog, JSON.stringify(registry.reasonFor(PACK_ROW.catalogId))).toBeDefined();

    const surfaceId = 'preset-surface';
    const processor = new MessageProcessor([catalog!], async () => undefined, {
      version: 'v0.9.1',
    });
    processor.processMessages([
      { version: 'v0.9.1', createSurface: { surfaceId, catalogId: catalog!.id } },
      { version: 'v0.9.1', updateDataModel: { surfaceId, path: '/selected', value: [] } },
      {
        version: 'v0.9.1',
        updateComponents: {
          surfaceId,
          components: [
            {
              id: 'root',
              component: 'MultiPicker',
              value: { path: '/selected' },
              options: [
                { label: 'Station A', value: 'a' },
                { label: 'Station B', value: 'b' },
              ],
            },
          ],
        },
      },
    ] as A2uiMessage[]);
    const surface = processor.model.getSurface(surfaceId)!;

    render(<A2uiSurface surface={surface} />);

    const options = await screen.findAllByRole('checkbox');
    expect(options).toHaveLength(2);

    await user.click(options[0]!);
    await user.click(options[1]!);

    expect(options[0]).toBeChecked();
    expect(options[1]).toBeChecked();
  });
});

describe('accessibility of a rendered official example (S6 item 7)', () => {
  it('has no axe violations rendering the login-form example', async () => {
    const example = A2UI_BASIC_EXAMPLES.find((item) => item.file.includes('09_login-form'));
    expect(example).toBeDefined();

    const registry = new A2uiCatalogRegistry<ReactComponentImplementation>(KERNEL);
    registry.load([BASIC_CATALOG_ROW]);
    const catalog = registry.get(BASIC_CATALOG_ROW.catalogId)!;

    const first = example!.messages[0] as { createSurface: { surfaceId: string } };
    const surfaceId = first.createSurface.surfaceId;
    const processor = new MessageProcessor([catalog], async () => undefined, { version: 'v0.9' });
    processor.processMessages(example!.messages as A2uiMessage[]);
    const surface = processor.model.getSurface(surfaceId)!;

    const { container } = render(
      <MarkdownContext.Provider value={renderMarkdown}>
        <A2uiSurface surface={surface} />
      </MarkdownContext.Provider>,
    );
    await screen.findByText('Welcome back');

    expect(
      (await axe(container, { rules: { 'color-contrast': { enabled: false } } })).violations,
    ).toEqual([]);
  });
});
