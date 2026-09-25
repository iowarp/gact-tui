import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SshHost } from '@/lib/ssh-hosts';
import { SshConnectionRoute } from './ssh-connection-route';
import {
  applyRouteOrder,
  parseJumpDestination,
  reconcileJumpSteps,
  resolveRouteHop,
  routeSteps,
  uniqueProfileName,
} from './ssh-route-utils';

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

function renderRoute(value: SshHost | undefined, options: SshHost[] = [destination, gateway, bastion]) {
  const handlers = { onChange: vi.fn(), onConfigure: vi.fn(), onCreate: vi.fn() };
  render(<SshConnectionRoute {...handlers} options={options} value={value} />);
  return handlers;
}

describe('SshConnectionRoute', () => {
  it('shows one row to choose the destination when nothing is selected yet', () => {
    renderRoute(undefined);

    expect(screen.getByRole('combobox', { name: 'Saved SSH host' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add SSH host' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add hop' })).toBeDisabled();
  });

  it('adds a saved computer as a hop from the front-door route', async () => {
    const user = userEvent.setup();
    const { onChange } = renderRoute(destination);

    await user.click(screen.getByRole('button', { name: 'Add hop' }));
    await user.click(screen.getByRole('combobox', { name: 'New jump host' }));
    await user.click(screen.getByRole('option', { name: 'Campus gateway' }));

    expect(onChange).toHaveBeenCalledWith({ ...gateway, jumpHosts: ['utah'] });
  });

  it('opens the shared host dialog to add a new computer as the new destination', async () => {
    const user = userEvent.setup();
    const { onCreate } = renderRoute(destination);

    await user.click(screen.getByRole('button', { name: 'Add hop' }));
    await user.click(screen.getByRole('combobox', { name: 'New jump host' }));
    await user.click(screen.getByRole('option', { name: 'Add another computer…' }));

    expect(onCreate).toHaveBeenCalledWith({ index: 1, isDestination: true });
  });

  it('the new hop row has its own configure gear, even before anything is chosen', async () => {
    const user = userEvent.setup();
    const { onCreate } = renderRoute(destination);

    await user.click(screen.getByRole('button', { name: 'Add hop' }));
    // The current destination's own gear already shows its resolved name
    // ("Configure Utah cluster"), so the new row's unnamed gear is unambiguous.
    await user.click(screen.getByRole('button', { name: 'Add SSH host' }));

    expect(onCreate).toHaveBeenCalledWith({ index: 1, isDestination: true });
  });

  it('configures hops and the destination through the same configure action', async () => {
    const user = userEvent.setup();
    const { onConfigure } = renderRoute({ ...destination, jumpHosts: ['gateway', 'bastion'] });

    await user.click(screen.getByRole('button', { name: 'Configure jump host 2' }));
    await user.click(screen.getByRole('button', { name: 'Configure Utah cluster' }));

    expect(onConfigure.mock.calls).toEqual([
      [{ index: 1, isDestination: false }],
      [{ index: 2, isDestination: true }],
    ]);
  });

  it('adds a typed OpenSSH alias as a hop', async () => {
    const user = userEvent.setup();
    const { onChange } = renderRoute(destination);

    await user.click(screen.getByRole('button', { name: 'Add hop' }));
    await user.click(screen.getByRole('combobox', { name: 'New jump host' }));
    await user.click(screen.getByRole('option', { name: 'Type an OpenSSH alias or address…' }));
    await user.type(
      screen.getByLabelText('Jump host alias or address'),
      'alice@gw.alcf.anl.gov{Enter}',
    );

    expect(onChange).toHaveBeenCalledWith({
      id: 'draft:alice@gw.alcf.anl.gov',
      label: 'alice@gw.alcf.anl.gov',
      host: 'gw.alcf.anl.gov',
      user: 'alice',
      port: 22,
      jumpHosts: ['utah'],
    });
  });

  it('refuses a typed hop that would corrupt the OpenSSH configuration', async () => {
    const user = userEvent.setup();
    const { onChange } = renderRoute(destination);

    await user.click(screen.getByRole('button', { name: 'Add hop' }));
    await user.click(screen.getByRole('combobox', { name: 'New jump host' }));
    await user.click(screen.getByRole('option', { name: 'Type an OpenSSH alias or address…' }));
    await user.type(screen.getByLabelText('Jump host alias or address'), 'alice@gw -p 2222{Enter}');

    expect(screen.getByText(/without spaces, commas/u)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Use this jump host' })).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('never offers the current destination as another hop', async () => {
    const user = userEvent.setup();
    renderRoute(destination);

    await user.click(screen.getByRole('button', { name: 'Add hop' }));
    await user.click(screen.getByRole('combobox', { name: 'New jump host' }));

    expect(screen.queryByRole('option', { name: 'Utah cluster' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Campus gateway' })).toBeVisible();
  });

  it('removes one hop without touching the others', async () => {
    const user = userEvent.setup();
    const { onChange } = renderRoute({ ...destination, jumpHosts: ['gateway', 'bastion'] });

    await user.click(screen.getByRole('button', { name: 'Remove jump host 1' }));

    expect(onChange).toHaveBeenCalledWith({ ...destination, jumpHosts: ['bastion'] });
  });

  it('reordering moves the destination — the last hop is the destination', async () => {
    const user = userEvent.setup();
    const { onChange } = renderRoute({ ...destination, jumpHosts: ['gateway', 'bastion'] });

    // Real drag-and-drop is verified against a live Chromium harness (per
    // #437); here, removing the destination exercises the same "whichever hop
    // is now last becomes the destination" recomputation that a drop commits.
    await user.click(screen.getByRole('button', { name: 'Remove destination' }));

    expect(onChange).toHaveBeenCalledWith({ ...bastion, jumpHosts: ['gateway'] });
  });

  it('clears the route entirely once the only hop is removed', async () => {
    const user = userEvent.setup();
    const { onChange } = renderRoute(destination);

    await user.click(screen.getByRole('button', { name: 'Remove destination' }));

    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});

describe('route utilities', () => {
  it('flattens a destination and its jump hosts into one ordered hop list', () => {
    expect(routeSteps(undefined)).toEqual([]);
    expect(routeSteps({ ...destination, jumpHosts: ['gateway', 'bastion'] })).toEqual([
      'gateway',
      'bastion',
      'utah',
    ]);
  });

  it('resolves a hop reference to the saved computer it names, or a parsed draft', () => {
    expect(resolveRouteHop('gateway', [destination, gateway])).toBe(gateway);
    expect(resolveRouteHop('alice@gw.alcf.anl.gov', [destination, gateway])).toEqual({
      id: 'draft:alice@gw.alcf.anl.gov',
      label: 'alice@gw.alcf.anl.gov',
      host: 'gw.alcf.anl.gov',
      user: 'alice',
      port: 22,
      jumpHosts: [],
    });
  });

  it('recomputes the destination as whichever hop lands last', () => {
    const resolve = (ref: string) => resolveRouteHop(ref, [destination, gateway, bastion]);
    expect(applyRouteOrder([], resolve)).toBeUndefined();
    expect(applyRouteOrder(['utah'], resolve)).toEqual({ ...destination, jumpHosts: [] });
    // Reordering so "gateway" lands last promotes it to the destination.
    expect(applyRouteOrder(['utah', 'gateway'], resolve)).toEqual({
      ...gateway,
      jumpHosts: ['utah'],
    });
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
    expect(parseJumpDestination('alice@[2001:db8::1]:2200')).toEqual({
      host: '2001:db8::1',
      user: 'alice',
      port: 2200,
    });
    expect(parseJumpDestination('2001:db8::1')).toEqual({
      host: '2001:db8::1',
      user: undefined,
      port: 22,
    });
  });

  it('names a new computer without colliding with an existing alias', () => {
    expect(uniqueProfileName('Gateway', 'gw.edu', ['gateway', 'Gateway-2'])).toBe('gateway-3');
    expect(uniqueProfileName('', 'gw.edu', [])).toBe('gw.edu');
  });
});
