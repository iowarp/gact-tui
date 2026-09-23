import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SshHost } from '@/lib/ssh-hosts';
import { SshConnectionRoute } from './ssh-connection-route';
import { reorderJumpHosts } from './ssh-route-utils';

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

afterEach(cleanup);

describe('SshConnectionRoute', () => {
  it('adds a preconfigured jump host from the front-door route', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SshConnectionRoute
        onChange={onChange}
        onConfigureDestination={vi.fn()}
        onCreateDestination={vi.fn()}
        options={[destination, gateway]}
        value={destination}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Add jump host' }));
    await user.click(screen.getByRole('combobox', { name: 'Preconfigured jump host' }));
    await user.click(screen.getByRole('option', { name: 'Campus gateway' }));

    expect(onChange).toHaveBeenCalledWith({ ...destination, jumpHosts: ['gateway'] });
  });

  it('configures an arbitrary OpenSSH jump destination from the step gear', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SshConnectionRoute
        onChange={onChange}
        onConfigureDestination={vi.fn()}
        onCreateDestination={vi.fn()}
        options={[destination]}
        value={destination}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Add jump host' }));
    await user.click(screen.getByRole('button', { name: 'Configure new jump host' }));
    await user.type(screen.getByLabelText('Jump host address'), 'alice@gateway.example.edu:2222');
    await user.click(screen.getByRole('button', { name: 'Use jump host' }));

    expect(onChange).toHaveBeenCalledWith({
      ...destination,
      jumpHosts: ['alice@gateway.example.edu:2222'],
    });
  });

  it('puts destination configuration on the route row', async () => {
    const user = userEvent.setup();
    const configure = vi.fn();
    render(
      <SshConnectionRoute
        onChange={vi.fn()}
        onConfigureDestination={configure}
        onCreateDestination={vi.fn()}
        options={[destination]}
        value={destination}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Configure Utah cluster' }));
    expect(configure).toHaveBeenCalledOnce();
  });

  it('preserves ordered ProxyJump semantics when route steps are reordered', () => {
    expect(reorderJumpHosts(['gateway', 'bastion'], 'ssh-jump-0', 'ssh-jump-1')).toEqual([
      'bastion',
      'gateway',
    ]);
  });
});
