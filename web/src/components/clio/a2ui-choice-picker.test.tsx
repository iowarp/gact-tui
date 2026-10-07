import { A2uiCatalogRegistry } from '@clio/core/v3';
import { MessageProcessor, type A2uiMessage } from '@a2ui/web_core/v0_9';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import { BASIC_CATALOG_ROW } from '@/test-fixtures/a2ui/v0_9_1/fixtures';
import { A2uiSurface, KERNEL_COMPONENTS, KERNEL_FUNCTIONS } from '@/lib/a2ui/kernel-catalog';

afterEach(cleanup);

function picker(variant: 'multipleSelection' | 'mutuallyExclusive') {
  const registry = new A2uiCatalogRegistry({
    components: KERNEL_COMPONENTS,
    functions: KERNEL_FUNCTIONS,
  });
  registry.load([BASIC_CATALOG_ROW]);
  const catalog = registry.get(BASIC_CATALOG_ROW.catalogId)!;
  const processor = new MessageProcessor([catalog], async () => undefined, { version: 'v0.9.1' });
  const surfaceId = 'large-picker';
  processor.processMessages([
    { version: 'v0.9.1', createSurface: { surfaceId, catalogId: catalog.id } },
    { version: 'v0.9.1', updateDataModel: { surfaceId, path: '/selected', value: [] } },
    {
      version: 'v0.9.1',
      updateComponents: {
        surfaceId,
        components: [
          {
            id: 'root',
            component: 'ChoicePicker',
            label: 'Plants',
            variant,
            value: { path: '/selected' },
            options: Array.from({ length: 150 }, (_, i) => ({
              label: `Plant ${i + 1}`,
              value: String(i + 1),
            })),
          },
        ],
      },
    },
  ] as A2uiMessage[]);
  render(<A2uiSurface surface={processor.model.getSurface(surfaceId)!} />);
}

it('searches 150 choices and preserves multiple selections across searches', async () => {
  const user = userEvent.setup();
  picker('multipleSelection');
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  await user.click(screen.getByRole('combobox', { name: 'Plants' }));
  await user.type(screen.getByPlaceholderText('Search Plants…'), 'Plant 149');
  expect(screen.getAllByRole('option')).toHaveLength(1);
  await user.click(screen.getByRole('option', { name: 'Plant 149' }));
  await user.clear(screen.getByPlaceholderText('Search Plants…'));
  await user.type(screen.getByPlaceholderText('Search Plants…'), 'Plant 150');
  await user.click(screen.getByRole('option', { name: 'Plant 150' }));
  await user.keyboard('{Escape}');
  expect(screen.getByRole('combobox', { name: 'Plants' })).toHaveTextContent(
    'Plant 149, Plant 150',
  );
});

it('replaces an exclusive choice and closes the search dropdown', async () => {
  const user = userEvent.setup();
  picker('mutuallyExclusive');
  await user.click(screen.getByRole('combobox', { name: 'Plants' }));
  await user.type(screen.getByPlaceholderText('Search Plants…'), 'Plant 150');
  await user.click(screen.getByRole('option', { name: 'Plant 150' }));
  expect(screen.queryByPlaceholderText('Search Plants…')).not.toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Plants' })).toHaveTextContent('Plant 150');
  await user.click(screen.getByRole('combobox', { name: 'Plants' }));
  await user.type(screen.getByPlaceholderText('Search Plants…'), 'Plant 149');
  await user.click(screen.getByRole('option', { name: 'Plant 149' }));
  expect(screen.getByRole('combobox', { name: 'Plants' })).toHaveTextContent('Plant 149');
  expect(screen.getByRole('combobox', { name: 'Plants' })).not.toHaveTextContent('Plant 150');
});
