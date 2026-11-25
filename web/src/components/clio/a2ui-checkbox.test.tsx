import { Catalog, MessageProcessor, type A2uiMessage } from '@a2ui/web_core/v0_9';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import { A2uiSurface, KERNEL_COMPONENTS, KERNEL_FUNCTIONS } from '@/lib/a2ui/kernel-catalog';

afterEach(cleanup);

function renderStations(checks: unknown[] = []) {
  const catalog = new Catalog(
    'test://checkbox',
    [...KERNEL_COMPONENTS.values()],
    [...KERNEL_FUNCTIONS.values()],
  );
  const processor = new MessageProcessor([catalog], () => undefined, { version: 'v0.9.1' });
  processor.processMessages([
    { version: 'v0.9.1', createSurface: { surfaceId: 'stations', catalogId: catalog.id } },
    {
      version: 'v0.9.1',
      updateDataModel: { surfaceId: 'stations', path: '/p', value: { a: false, b: true } },
    },
    {
      version: 'v0.9.1',
      updateComponents: {
        surfaceId: 'stations',
        components: [
          { id: 'root', component: 'Row', children: ['a', 'b'] },
          { id: 'a', component: 'CheckBox', label: 'P395', value: { path: '/p/a' }, checks },
          { id: 'b', component: 'CheckBox', label: 'P396', value: { path: '/p/b' } },
        ],
      },
    },
  ] as A2uiMessage[]);
  const surface = processor.model.getSurface('stations')!;
  render(<A2uiSurface surface={surface} />);
  return surface;
}

it('renders CLIO checkboxes whose whole row is a labelled hit target', () => {
  renderStations();
  const first = screen.getByRole('checkbox', { name: 'P395' });
  expect(first).toHaveAttribute('data-slot', 'checkbox');
  expect(first).not.toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'P396' })).toBeChecked();
  const row = screen.getByText('P395').closest('label')!;
  expect(row.className).toContain('min-h-9');
  expect(row.className).toContain('pointer-coarse:min-h-11');
});

it('writes the bound value when the label is clicked', async () => {
  const surface = renderStations();
  await userEvent.click(screen.getByText('P395'));
  expect(surface.dataModel.get('/p/a')).toBe(true);
  expect(screen.getByRole('checkbox', { name: 'P395' })).toBeChecked();
  await userEvent.click(screen.getByRole('checkbox', { name: 'P396' }));
  expect(surface.dataModel.get('/p/b')).toBe(false);
});

it('shows a failed check in words beside the box', () => {
  renderStations([{ condition: { path: '/p/b/missing' }, message: 'Pick at least one station' }]);
  expect(screen.getByRole('alert')).toHaveTextContent('Pick at least one station');
  expect(screen.getByRole('checkbox', { name: 'P395' })).toHaveAttribute('aria-invalid', 'true');
});
