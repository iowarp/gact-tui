import { Catalog, MessageProcessor, type A2uiMessage } from '@a2ui/web_core/v0_9';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { A2uiSurface, KERNEL_COMPONENTS, KERNEL_FUNCTIONS } from '@/lib/a2ui/kernel-catalog';
import { dateTimeFieldValue } from './a2ui-date-time-input';

afterEach(cleanup);

it('converts UTC and offset timestamps into the displayed local zone, preserving wall-only and time-only values', () => {
  const instant = new Date('2026-10-20T12:00:00Z');
  const wall = new Date(instant.getTime() - instant.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 19);
  expect(dateTimeFieldValue('2026-10-20T12:00:00Z', true, true)).toBe(wall);
  expect(dateTimeFieldValue('2026-10-20T14:00:00+02:00', true, true)).toBe(wall);
  expect(dateTimeFieldValue('2026-10-20T09:00', true, true)).toBe('2026-10-20T09:00');
  expect(dateTimeFieldValue('14:35:10', false, true)).toBe('14:35:10');
  expect(dateTimeFieldValue('2004-01-10', true, false)).toBe('2004-01-10');
});

it.each(['2026-10-21T09:00', '2026-10-21T14:00:10Z'])(
  'updates the %s binding without sending an action or losing its time zone',
  async (initial) => {
    const action = vi.fn();
    const catalog = new Catalog(
      'test://datetime',
      [...KERNEL_COMPONENTS.values()],
      [...KERNEL_FUNCTIONS.values()],
    );
    const processor = new MessageProcessor([catalog], action, { version: 'v0.9.1' });
    processor.processMessages([
      { version: 'v0.9.1', createSurface: { surfaceId: 'dates', catalogId: catalog.id } },
      {
        version: 'v0.9.1',
        updateDataModel: { surfaceId: 'dates', path: '/when', value: initial },
      },
      {
        version: 'v0.9.1',
        updateComponents: {
          surfaceId: 'dates',
          components: [
            {
              id: 'root',
              component: 'DateTimeInput',
              label: 'Observation',
              enableDate: true,
              enableTime: true,
              value: { path: '/when' },
            },
          ],
        },
      },
    ] as A2uiMessage[]);
    const surface = processor.model.getSurface('dates')!;
    render(<A2uiSurface surface={surface} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Observation October/u }));
    await user.click(screen.getByRole('button', { name: 'Thursday, October 22nd, 2026' }));
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Observation date' })).toHaveValue('2026-10-22'),
    );
    expect(surface.dataModel.get('/when')).toBe(initial);
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    const next = `2026-10-22T${dateTimeFieldValue(initial, true, true).split('T')[1]}`;
    await waitFor(() =>
      expect(surface.dataModel.get('/when')).toBe(
        initial.endsWith('Z') ? new Date(next).toISOString() : next,
      ),
    );
    expect(action).not.toHaveBeenCalled();
  },
);
