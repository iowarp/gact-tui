import { Catalog, MessageProcessor, type A2uiMessage } from '@a2ui/web_core/v0_9';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { A2uiSurface, KERNEL_COMPONENTS, KERNEL_FUNCTIONS } from '@/lib/a2ui/kernel-catalog';

afterEach(cleanup);

function renderSurface(components: Record<string, unknown>[], data: Record<string, unknown>) {
  const action = vi.fn();
  const catalog = new Catalog(
    'test://dialogs',
    [...KERNEL_COMPONENTS.values()],
    [...KERNEL_FUNCTIONS.values()],
  );
  const processor = new MessageProcessor([catalog], action, { version: 'v0.9.1' });
  processor.processMessages([
    { version: 'v0.9.1', createSurface: { surfaceId: 'page', catalogId: catalog.id } },
    ...Object.entries(data).map(([path, value]) => ({
      version: 'v0.9.1',
      updateDataModel: { surfaceId: 'page', path, value },
    })),
    { version: 'v0.9.1', updateComponents: { surfaceId: 'page', components } },
  ] as A2uiMessage[]);
  const surface = processor.model.getSurface('page')!;
  render(<A2uiSurface surface={surface} />);
  return { action, surface };
}

const dialog = (extra: Record<string, unknown> = {}) => [
  { id: 'root', component: 'Column', children: ['add'] },
  {
    id: 'add',
    component: 'clio.dialog.v1',
    title: 'Add endpoint',
    open: { path: '/dialogs/add' },
    trigger: 'add-open',
    activeTab: { path: '/add/tab' },
    tabs: [
      { id: 'catalog', title: 'Catalog', icon: 'book', child: 'catalog-body' },
      { id: 'saved', title: 'Saved', icon: 'bookmark', child: 'saved-body' },
    ],
    rail: { steps: ['Site', 'Protocol', 'Test', 'Save'], step: 1 },
    test: {
      label: 'Test',
      action: { event: { name: 'test', context: { values: { path: '/add' } } } },
    },
    confirm: { label: 'Save', action: { event: { name: 'save' } } },
    onClose: { event: { name: 'close' } },
    ...extra,
  },
  {
    id: 'add-open',
    component: 'Button',
    child: 'add-open-label',
    action: { event: { name: 'open' } },
  },
  { id: 'add-open-label', component: 'Text', text: 'Add endpoint' },
  { id: 'catalog-body', component: 'Text', text: 'Catalog body' },
  { id: 'saved-body', component: 'Text', text: 'Saved body' },
];

it('opens the dialog from its trigger as a modal and still sends the trigger action', async () => {
  const { action, surface } = renderSurface(dialog(), {
    '/dialogs/add': false,
    '/add/tab': 'catalog',
  });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Add endpoint' }));
  expect(await screen.findByRole('dialog', { name: 'Add endpoint' })).toBeInTheDocument();
  expect(surface.dataModel.get('/dialogs/add')).toBe(true);
  expect(action).toHaveBeenCalledWith(expect.objectContaining({ name: 'open' }));
  expect(screen.getByText('Catalog body')).toBeInTheDocument();
  expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('2 Protocol');
});

it('writes the active tab and closes on Escape with onClose', async () => {
  const { action, surface } = renderSurface(dialog(), {
    '/dialogs/add': true,
    '/add/tab': 'catalog',
  });
  const user = userEvent.setup();
  await user.click(await screen.findByRole('tab', { name: 'Saved' }));
  expect(surface.dataModel.get('/add/tab')).toBe('saved');
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(surface.dataModel.get('/dialogs/add')).toBe(false);
  expect(action).toHaveBeenCalledWith(expect.objectContaining({ name: 'close' }));
});

it('closes when the server sets open false', async () => {
  const { surface } = renderSurface(dialog(), { '/dialogs/add': true, '/add/tab': 'catalog' });
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  surface.dataModel.set('/dialogs/add', false);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('fires Test on Ctrl+Shift+Enter with its context resolved', async () => {
  const { action } = renderSurface(dialog(), {
    '/dialogs/add': true,
    '/add/tab': 'catalog',
    '/add': { site: 'ares' },
  });
  await screen.findByRole('dialog');
  await userEvent.setup().keyboard('{Control>}{Shift>}{Enter}{/Shift}{/Control}');
  expect(action).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'test', context: { values: { site: 'ares' } } }),
  );
  expect(action).not.toHaveBeenCalledWith(expect.objectContaining({ name: 'save' }));
});

it('a cancel with an action sends it and leaves the dialog open', async () => {
  const { action } = renderSurface(
    dialog({ cancel: { label: 'Back', action: { event: { name: 'back' } } } }),
    { '/dialogs/add': true, '/add/tab': 'catalog' },
  );
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Back' }));
  expect(action).toHaveBeenCalledWith(expect.objectContaining({ name: 'back' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

const picker = (extra: Record<string, unknown> = {}) => [
  {
    id: 'root',
    component: 'clio.picker.v1',
    label: 'Site',
    search: 'Search sites',
    value: { path: '/add/site' },
    limit: 2,
    items: [
      { value: 'ares', title: 'Ares', subtitle: 'Illinois Tech', chips: ['SSH', 'Tapis'] },
      { value: 'polaris', title: 'ALCF Polaris', meta: 'PBS' },
      { value: 'vista', title: 'TACC Vista' },
    ],
    onPick: { event: { name: 'pick', context: { field: 'site' } } },
    ...extra,
  },
];

it('picks a row: writes the value, then sends onPick with the value', async () => {
  const { action, surface } = renderSurface(picker(), { '/add/site': '' });
  await userEvent.setup().click(screen.getByRole('radio', { name: /ALCF Polaris/ }));
  expect(surface.dataModel.get('/add/site')).toBe('polaris');
  expect(action).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'pick', context: { field: 'site', value: 'polaris' } }),
  );
});

it('shows the limit with a more line, and a search finds the rest', async () => {
  renderSurface(picker(), { '/add/site': 'ares' });
  expect(screen.getAllByRole('radio')).toHaveLength(2);
  expect(screen.getByRole('radio', { name: /Ares/ })).toHaveAttribute('aria-checked', 'true');
  expect(screen.getByRole('button', { name: '1 more: TACC Vista' })).toBeInTheDocument();
  const user = userEvent.setup();
  await user.type(screen.getByRole('searchbox', { name: 'Search sites' }), 'vista');
  expect(screen.getAllByRole('radio')).toHaveLength(1);
});

it('shows the error under the list', () => {
  renderSurface(picker({ error: 'Pick a site first' }), { '/add/site': '' });
  expect(screen.getByRole('alert')).toHaveTextContent('Pick a site first');
});
