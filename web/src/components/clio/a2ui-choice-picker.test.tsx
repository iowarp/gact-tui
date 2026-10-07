import { A2uiCatalogRegistry } from '@clio/core/v3';
import { MessageProcessor, type A2uiMessage } from '@a2ui/web_core/v0_9';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { afterEach, expect, it } from 'vitest';
import { BASIC_CATALOG_ROW } from '@/test-fixtures/a2ui/v0_9_1/fixtures';
import { A2uiSurface, KERNEL_COMPONENTS, KERNEL_FUNCTIONS } from '@/lib/a2ui/kernel-catalog';

afterEach(cleanup);

function picker(
  variant: 'multipleSelection' | 'mutuallyExclusive',
  count = 150,
  selected: string[] = [],
) {
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
    { version: 'v0.9.1', updateDataModel: { surfaceId, path: '/selected', value: selected } },
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
            options: Array.from({ length: count }, (_, i) => ({
              label: `Plant ${i + 1}`,
              value: String(i + 1),
            })),
          },
        ],
      },
    },
  ] as A2uiMessage[]);
  render(
    <main>
      <A2uiSurface surface={processor.model.getSurface(surfaceId)!} />
    </main>,
  );
}

it.each(['multipleSelection', 'mutuallyExclusive'] as const)(
  'keeps eight %s options inline and switches nine to a dropdown',
  async (variant) => {
    picker(variant, 8);
    const role = variant === 'multipleSelection' ? 'checkbox' : 'radio';
    expect(screen.getAllByRole(role)).toHaveLength(8);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    cleanup();
    picker(variant, 9);
    expect(screen.queryByRole(role)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('combobox', { name: 'Plants' }));
    expect(screen.getAllByRole('option')).toHaveLength(9);
  },
);

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

it('selects with the keyboard and returns focus to the closed dropdown', async () => {
  const user = userEvent.setup();
  picker('mutuallyExclusive', 9);
  const trigger = screen.getByRole('combobox', { name: 'Plants' });
  trigger.focus();
  await user.keyboard('{Enter}');
  const search = screen.getByRole('combobox', { name: 'Search Plants' });
  expect(search).toHaveFocus();
  await user.type(search, 'Plant 9');
  await user.keyboard('{ArrowDown}{Enter}');
  expect(trigger).toHaveTextContent('Plant 9');
  expect(trigger).toHaveFocus();
});

it('reports an empty search without losing selected values', async () => {
  const user = userEvent.setup();
  picker('multipleSelection', 150, ['149']);
  await user.click(screen.getByRole('combobox', { name: 'Plants' }));
  await user.type(screen.getByRole('combobox', { name: 'Search Plants' }), 'absent plant');
  expect(screen.getByText('No matching options.')).toBeInTheDocument();
  expect(screen.queryByRole('option')).not.toBeInTheDocument();
  await user.keyboard('{Escape}');
  expect(screen.getByRole('combobox', { name: 'Plants' })).toHaveTextContent('Plant 149');
});

it('matches option IDs literally and labels without case sensitivity', async () => {
  const user = userEvent.setup();
  picker('multipleSelection');
  await user.click(screen.getByRole('combobox', { name: 'Plants' }));
  const search = screen.getByRole('combobox', { name: 'Search Plants' });
  await user.type(search, '150');
  expect(screen.getAllByRole('option')).toHaveLength(1);
  expect(screen.getByRole('option', { name: 'Plant 150' })).toBeInTheDocument();
  await user.clear(search);
  await user.type(search, 'pLaNt 149');
  expect(screen.getAllByRole('option')).toHaveLength(1);
  expect(screen.getByRole('option', { name: 'Plant 149' })).toBeInTheDocument();
});

it('shows a compact count for several choices and lets a searched choice be removed', async () => {
  const user = userEvent.setup();
  picker('multipleSelection', 150, ['148', '149', '150']);
  const trigger = screen.getByRole('combobox', { name: 'Plants' });
  expect(trigger).toHaveTextContent('3 selected');
  expect(screen.getByTitle('Plant 148, Plant 149, Plant 150')).toBeInTheDocument();
  await user.click(trigger);
  await user.type(screen.getByRole('combobox', { name: 'Search Plants' }), 'Plant 149');
  await user.click(screen.getByRole('option', { name: 'Plant 149' }));
  await user.keyboard('{Escape}');
  expect(trigger).toHaveTextContent('Plant 148, Plant 150');
});

it('labels the search popup and exposes its relationship to the trigger accessibly', async () => {
  const user = userEvent.setup();
  picker('multipleSelection', 9);
  const trigger = screen.getByRole('combobox', { name: 'Plants' });
  await user.click(trigger);
  expect(trigger).toHaveAttribute('aria-controls', screen.getByRole('dialog').id);
  expect(screen.getByRole('dialog')).toHaveAccessibleName('Plants choices');
  expect(
    (await axe(document.body, { rules: { 'color-contrast': { enabled: false } } })).violations,
  ).toEqual([]);
});
