import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SshHost } from '@/lib/ssh-hosts';
import { SshConnectionRoute } from './ssh-connection-route';
import { parseJumpDestination, reconcileJumpSteps } from './ssh-route-utils';

const destination: SshHost = {
  id: 'profile:utah',
  label: 'Utah cluster',
  profile: 'utah',
  host: 'notchpeak1.chpc.utah.edu',
  port: 22,
  jumpHosts: [],
};
const gateway: SshHost = {
  id: 'profile:gateway',
  label: 'Campus gateway',
  profile: 'gateway',
  host: 'gateway.example.edu',
  port: 22,
  jumpHosts: [],
};
const bastion: SshHost = { ...gateway, id: 'profile:bastion', label: 'Bastion', profile: 'bastion' };

afterEach(cleanup);

function renderRoute(value: SshHost, options: SshHost[] = [destination, gateway, bastion]) {
  const handlers = { onChange: vi.fn(), onConfigure: vi.fn(), onCreate: vi.fn() };
  render(<SshConnectionRoute {...handlers} options={options} value={value} />);
  return handlers;
}

describe('SshConnectionRoute', () => {
  it('adds a saved computer as a jump host from the front-door route', async () => {
    const user = userEvent.setup();
    const { onChange } = renderRoute(destination);

    await user.click(screen.getByRole('button', { name: 'Add jump host' }));
    await user.click(screen.getByRole('combobox', { name: 'New jump host' }));
    await user.click(screen.getByRole('option', { name: 'Campus gateway' }));

    expect(onChange).toHaveBeenCalledWith({ ...destination, jumpHosts: ['gateway'] });
  });

  it('opens the shared host dialog to add a new computer as a jump host', async () => {
    const user = userEvent.setup();
    const { onCreate } = renderRoute(destination);

    await user.click(screen.getByRole('button', { name: 'Add jump host' }));
    await user.click(screen.getByRole('combobox', { name: 'New jump host' }));
    await user.click(screen.getByRole('option', { name: 'Add another computer…' }));

    expect(onCreate).toHaveBeenCalledWith({ kind: 'jump', index: 'new' });
  });

  it('configures jump hosts and the destination through the same configure action', async () => {
    const user = userEvent.setup();
    const { onConfigure } = renderRoute({ ...destination, jumpHosts: ['gateway', 'bastion'] });

    await user.click(screen.getByRole('button', { name: 'Configure jump host 2' }));
    await user.click(screen.getByRole('button', { name: 'Configure Utah cluster' }));

    expect(onConfigure.mock.calls).toEqual([
      [{ kind: 'jump', index: 1 }],
      [{ kind: 'destination' }],
    ]);
  });

  it('removes one jump host without touching the others', async () => {
    const user = userEvent.setup();
    const { onChange } = renderRoute({ ...destination, jumpHosts: ['gateway', 'bastion'] });

    await user.click(screen.getByRole('button', { name: 'Remove jump host 1' }));

    expect(onChange).toHaveBeenCalledWith({ ...destination, jumpHosts: ['bastion'] });
  });
});

describe('jump step identity', () => {
  it('keeps each step identity across a reorder, including repeated destinations', () => {
    const before = reconcileJumpSteps([], ['gateway', 'bastion', 'gateway']);
    const after = reconcileJumpSteps(before, ['bastion', 'gateway', 'gateway']);

    expect(after.map((step) => step.key)).toEqual([before[1].key, before[0].key, before[2].key]);
    expect(new Set(after.map((step) => step.key)).size).toBe(3);
  });

  it('parses a free-form OpenSSH jump destination for the host dialog', () => {
    expect(parseJumpDestination('alice@gateway.example.edu:2222')).toEqual({
      host: 'gateway.example.edu',
      user: 'alice',
      port: 2222,
    });
    expect(parseJumpDestination('bastion')).toEqual({ host: 'bastion', user: undefined, port: 22 });
  });
});
