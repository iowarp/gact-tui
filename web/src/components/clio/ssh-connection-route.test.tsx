import { cleanup, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SshHost } from '@/lib/ssh-hosts';
import { SshConnectionRoute } from './ssh-connection-route';
import {
  applyRouteOrder,
  emptyRouteRows,
  parseJumpDestination,
  reconcileJumpSteps,
  resolveRouteHop,
  routeFromSlots,
  routeIncompleteMessage,
  routeSlots,
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
const bastion: SshHost = {
  ...gateway,
  id: 'profile:bastion',
  label: 'Bastion',
  profile: 'bastion',
};

afterEach(cleanup);

/** The route editor is controlled by its rows; hold them the way the picker does. */
function renderRoute(
  value: SshHost | undefined,
  options: SshHost[] = [destination, gateway, bastion],
) {
  const handlers = { onSlotsChange: vi.fn(), onConfigure: vi.fn(), onCreate: vi.fn() };
  const resolve = (ref: string) => resolveRouteHop(ref, options);
  const routes: Array<SshHost | undefined> = [];
  function Harness() {
    const [slots, setSlots] = useState(() => routeSlots(value));
    return (
      <SshConnectionRoute
        onConfigure={handlers.onConfigure}
        onCreate={handlers.onCreate}
        onSlotsChange={(next) => {
          handlers.onSlotsChange(next);
          routes.push(routeFromSlots(next, resolve));
          setSlots(next);
        }}
        options={options}
        slots={slots}
      />
    );
  }
  render(<Harness />);
  return { ...handlers, lastRoute: () => routes[routes.length - 1] };
}

describe('SshConnectionRoute', () => {
  it('shows one row to choose the destination when nothing is selected yet', () => {
    renderRoute(undefined);

    expect(screen.getByRole('combobox', { name: 'Saved SSH host' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add SSH host' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add hop' })).toBeEnabled();
  });

  it('adds hops before any computer is chosen; empty rows are real rows', async () => {
    const user = userEvent.setup();
    const { onSlotsChange, onConfigure, lastRoute } = renderRoute(undefined);

    await user.click(screen.getByRole('button', { name: 'Add hop' }));

    expect(onSlotsChange).toHaveBeenLastCalledWith(['', '']);
    expect(lastRoute()).toBeUndefined();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    // The first row is now a hop, the new last row is the destination.
    await user.click(screen.getByRole('combobox', { name: 'Jump host 1' }));
    await user.click(screen.getByRole('option', { name: 'Campus gateway' }));
    expect(onSlotsChange).toHaveBeenLastCalledWith(['gateway', '']);
    expect(lastRoute()).toBeUndefined();
    // Configure a brand-new computer straight into the empty destination row.
    await user.click(screen.getByRole('button', { name: 'Add SSH host' }));
    expect(onConfigure).toHaveBeenCalledWith({ index: 1, isDestination: true });
  });

  it('adds the compute node after the login node: the new row becomes the destination', async () => {
    const user = userEvent.setup();
    const { onSlotsChange, lastRoute } = renderRoute(gateway);

    await user.click(screen.getByRole('button', { name: 'Add hop' }));
    await user.click(screen.getByRole('combobox', { name: 'Saved SSH host' }));
    await user.click(screen.getByRole('option', { name: 'Utah cluster' }));

    expect(onSlotsChange).toHaveBeenLastCalledWith(['gateway', 'utah']);
    expect(lastRoute()).toEqual({ ...destination, jumpHosts: ['gateway'] });
  });

  it('the new hop row has its own configure gear, even before anything is chosen', async () => {
    const user = userEvent.setup();
    const { onConfigure } = renderRoute(destination);

    await user.click(screen.getByRole('button', { name: 'Add hop' }));
    // The earlier row's gear shows its resolved name ("Configure Utah
    // cluster"), so the new row's unnamed gear is unambiguous.
    await user.click(screen.getByRole('button', { name: 'Add SSH host' }));

    expect(onConfigure).toHaveBeenCalledWith({ index: 1, isDestination: true });
  });

  it('opens the shared host dialog to add a new computer into an empty row', async () => {
    const user = userEvent.setup();
    const { onCreate } = renderRoute(destination);

    await user.click(screen.getByRole('button', { name: 'Add hop' }));
    await user.click(screen.getByRole('combobox', { name: 'Saved SSH host' }));
    await user.click(screen.getByRole('option', { name: 'Add another computer…' }));

    expect(onCreate).toHaveBeenCalledWith({ index: 1, isDestination: true });
  });

  it('configures hops and the destination through the same configure action', async () => {
    const user = userEvent.setup();
    const { onConfigure } = renderRoute({ ...destination, jumpHosts: ['gateway', 'bastion'] });

    await user.click(screen.getByRole('button', { name: 'Configure Bastion' }));
    await user.click(screen.getByRole('button', { name: 'Configure Utah cluster' }));

    expect(onConfigure.mock.calls).toEqual([
      [{ index: 1, isDestination: false }],
      [{ index: 2, isDestination: true }],
    ]);
  });

  it('types an OpenSSH alias into a row', async () => {
    const user = userEvent.setup();
    const { lastRoute } = renderRoute(destination);

    await user.click(screen.getByRole('button', { name: 'Add hop' }));
    await user.click(screen.getByRole('combobox', { name: 'Saved SSH host' }));
    await user.click(screen.getByRole('option', { name: 'Type an OpenSSH alias or address…' }));
    await user.type(
      screen.getByLabelText('Jump host alias or address'),
      'alice@gw.alcf.anl.gov{Enter}',
    );

    expect(lastRoute()).toEqual({
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
    const { onSlotsChange } = renderRoute(destination);

    await user.click(screen.getByRole('button', { name: 'Add hop' }));
    onSlotsChange.mockClear();
    await user.click(screen.getByRole('combobox', { name: 'Saved SSH host' }));
    await user.click(screen.getByRole('option', { name: 'Type an OpenSSH alias or address…' }));
    await user.type(screen.getByLabelText('Jump host alias or address'), 'alice@gw -p 2222{Enter}');

    expect(screen.getByText(/without spaces, commas/u)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Use this jump host' })).toBeDisabled();
    expect(onSlotsChange).not.toHaveBeenCalled();
  });

  it('never offers a computer another row already uses', async () => {
    const user = userEvent.setup();
    renderRoute(destination);

    await user.click(screen.getByRole('button', { name: 'Add hop' }));
    await user.click(screen.getByRole('combobox', { name: 'Saved SSH host' }));

    expect(screen.queryByRole('option', { name: 'Utah cluster' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Campus gateway' })).toBeVisible();
  });

  it('removes one hop without touching the others', async () => {
    const user = userEvent.setup();
    const { lastRoute } = renderRoute({ ...destination, jumpHosts: ['gateway', 'bastion'] });

    await user.click(screen.getByRole('button', { name: 'Remove jump host 1' }));

    expect(lastRoute()).toEqual({ ...destination, jumpHosts: ['bastion'] });
  });

  it('reordering moves the destination — the last row is the destination', async () => {
    const user = userEvent.setup();
    const { lastRoute } = renderRoute({ ...destination, jumpHosts: ['gateway', 'bastion'] });

    // Real drag-and-drop is verified against a live Chromium harness (per
    // #437); here, removing the destination exercises the same "whichever row
    // is now last becomes the destination" recomputation that a drop commits.
    await user.click(screen.getByRole('button', { name: 'Remove destination' }));

    expect(lastRoute()).toEqual({ ...bastion, jumpHosts: ['gateway'] });
  });

  it('clears the route entirely once the only row is removed', async () => {
    const user = userEvent.setup();
    const { onSlotsChange } = renderRoute(destination);

    await user.click(screen.getByRole('button', { name: 'Remove destination' }));

    expect(onSlotsChange).toHaveBeenLastCalledWith([]);
  });

  it('separates the drag grip from what each row means, starting at this computer', () => {
    renderRoute({ ...destination, jumpHosts: ['gateway', 'bastion'] });

    // A fixed starting row: its meaning, no grip, not one of the sortable hops.
    const start = screen.getByRole('img', { name: 'Starting point' });
    expect(start.closest('[role="listitem"]')).toBeNull();
    expect(screen.getByText('This computer')).toBeVisible();
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    // Every hop row: a grip to reorder, then its meaning marker, then the host.
    expect(within(rows[0]).getByRole('button', { name: 'Reorder jump host 1' })).toBeVisible();
    expect(within(rows[0]).getByRole('img', { name: 'Hop' })).toBeVisible();
    expect(within(rows[1]).getByRole('img', { name: 'Hop' })).toBeVisible();
    expect(within(rows[2]).getByRole('button', { name: 'Reorder destination' })).toBeVisible();
    expect(within(rows[2]).getByRole('img', { name: 'Destination' })).toBeVisible();
    expect(within(rows[2]).queryByRole('img', { name: 'Hop' })).not.toBeInTheDocument();
  });

  it('locks every control while a deployment runs', () => {
    render(
      <SshConnectionRoute
        disabled
        onConfigure={vi.fn()}
        onCreate={vi.fn()}
        onSlotsChange={vi.fn()}
        options={[destination]}
        slots={['utah']}
      />,
    );

    expect(screen.getByRole('button', { name: 'Add hop' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Saved SSH host' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove destination' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Configure Utah cluster' })).toBeDisabled();
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

  it('describes no route while any row is empty, and names the first empty row', () => {
    const resolve = (ref: string) => resolveRouteHop(ref, [destination, gateway]);
    expect(routeSlots(undefined)).toEqual(['']);
    expect(routeFromSlots(['gateway', ''], resolve)).toBeUndefined();
    expect(routeFromSlots(['gateway', 'utah'], resolve)).toEqual({
      ...destination,
      jumpHosts: ['gateway'],
    });
    expect(emptyRouteRows(['', 'gateway', ''])).toEqual([0, 2]);
    expect(routeIncompleteMessage({ emptyRows: [1] })).toBe(
      'Choose a computer for hop 2, or remove it.',
    );
    expect(routeIncompleteMessage({ emptyRows: [] })).toBeUndefined();
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
