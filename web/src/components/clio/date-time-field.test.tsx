import { useState } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { DateTimeField } from './date-time-field';

// The calendar names today's button "Today, …"; pin the clock so the dates these
// tests pick never fall on the day the suite runs.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-01T12:00:00') });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('keeps date edits local, discards Cancel, and emits only on Apply', async () => {
  const user = userEvent.setup();
  const change = vi.fn();
  render(
    <DateTimeField
      label="Observation"
      value="2026-10-21T09:00"
      onChange={change}
      timezone="America/Chicago"
    />,
  );
  expect(change).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: /^Observation October/u }));
  expect(screen.queryByRole('tab', { name: 'before' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Thursday, October 22nd, 2026' }));
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(change).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: /^Observation October/u }));
  await user.click(screen.getByRole('button', { name: 'Friday, October 23rd, 2026' }));
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Observation date' })).toHaveValue('2026-10-23'),
  );
  await user.click(screen.getByRole('button', { name: 'Apply' }));
  expect(change).toHaveBeenCalledTimes(1);
  expect(change).toHaveBeenCalledWith('2026-10-23T09:00');
});

it('accepts typed times and keyboard stepping while retaining canonical 24-hour values', async () => {
  const user = userEvent.setup();
  const change = vi.fn();
  function Form() {
    const [value, setValue] = useState('09:00');
    return (
      <DateTimeField
        label="Run time"
        enableDate={false}
        value={value}
        onChange={(next) => {
          setValue(next);
          change(next);
        }}
      />
    );
  }
  render(<Form />);
  const input = screen.getByRole('textbox', { name: 'Run time' });
  await user.clear(input);
  await user.type(input, '14:35');
  await user.tab();
  expect(change).toHaveBeenLastCalledWith('14:35');
  await user.click(input);
  await user.keyboard('{ArrowUp}');
  expect(change).toHaveBeenLastCalledWith('14:36');
});

it('enforces date bounds and gives named, accessible calendar controls', async () => {
  const user = userEvent.setup();
  render(
    <main>
      <DateTimeField
        label="Observation"
        enableTime={false}
        value="2026-10-21"
        min="2026-10-22"
        max="2026-10-24"
        onChange={vi.fn()}
      />
    </main>,
  );
  await user.click(screen.getByRole('button', { name: /^Observation October/u }));
  expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('on or after 2026-10-22');
  await user.click(screen.getByRole('button', { name: 'Friday, October 23rd, 2026' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled());
  expect(screen.getByRole('button', { name: /Previous Month/u })).toBeVisible();
  expect(
    (
      await axe(document.body, {
        rules: { region: { enabled: false }, 'color-contrast': { enabled: false } },
      })
    ).violations,
  ).toEqual([]);
});
