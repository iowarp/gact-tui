import { Catalog, MessageProcessor, type A2uiMessage } from '@a2ui/web_core/v0_9';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { A2uiSurface, KERNEL_COMPONENTS, KERNEL_FUNCTIONS } from '@/lib/a2ui/kernel-catalog';

afterEach(cleanup);

function renderAction(variant?: 'default' | 'primary' | 'borderless', valid = true) {
  const action = vi.fn();
  const catalog = new Catalog(
    'test://buttons',
    [...KERNEL_COMPONENTS.values()],
    [...KERNEL_FUNCTIONS.values()],
  );
  const processor = new MessageProcessor([catalog], action, { version: 'v0.9.1' });
  processor.processMessages([
    { version: 'v0.9.1', createSurface: { surfaceId: 'choice', catalogId: catalog.id } },
    {
      version: 'v0.9.1',
      updateDataModel: { surfaceId: 'choice', path: '/when', value: '2026-10-22T09:00' },
    },
    {
      version: 'v0.9.1',
      updateDataModel: { surfaceId: 'choice', path: '/valid', value: valid },
    },
    {
      version: 'v0.9.1',
      updateComponents: {
        surfaceId: 'choice',
        components: [
          {
            id: 'root',
            component: 'Button',
            child: 'label',
            variant,
            checks: [{ condition: { path: '/valid' }, message: 'Choose a date first' }],
            action: { event: { name: 'confirm', context: { when: { path: '/when' } } } },
          },
          { id: 'label', component: 'Text', text: 'Confirm choice' },
        ],
      },
    },
  ] as A2uiMessage[]);
  const surface = processor.model.getSurface('choice')!;
  render(<A2uiSurface surface={surface} />);
  return { action, surface };
}

it.each([
  [undefined, 'outline'],
  ['default', 'outline'],
  ['primary', 'default'],
  ['borderless', 'ghost'],
] as const)('renders %s actions with shared %s button styling', (variant, expected) => {
  renderAction(variant);
  const button = screen.getByRole('button', { name: 'Confirm choice' });
  expect(button).toHaveAttribute('data-slot', 'button');
  expect(button).toHaveAttribute('data-variant', expected);
  expect(button).toHaveAttribute('type', 'button');
});

it('sends the current bound value once on keyboard activation without changing it', async () => {
  const { action, surface } = renderAction('primary');
  surface.dataModel.set('/when', '2026-10-23T10:30');
  const user = userEvent.setup();
  await user.tab();
  expect(screen.getByRole('button', { name: 'Confirm choice' })).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(action).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(action.mock.calls[0])).toContain('2026-10-23T10:30');
  expect(surface.dataModel.get('/when')).toBe('2026-10-23T10:30');
});

it('keeps invalid actions disabled', async () => {
  const { action } = renderAction('primary', false);
  const button = screen.getByRole('button', { name: 'Confirm choice' });
  expect(button).toBeDisabled();
  await userEvent.click(button);
  expect(action).not.toHaveBeenCalled();
});
