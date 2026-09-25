import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SshAuthentication } from './managed-service-target';

vi.mock('@/tauri/ssh-infrastructure-transport', () => ({
  writeSshTransport: vi.fn().mockResolvedValue(undefined),
}));

afterEach(cleanup);

describe('SshAuthentication', () => {
  it('does not bubble its prompt submission into an outer dialog form (#1437)', async () => {
    const user = userEvent.setup();
    const outerSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());

    // Mirrors ssh-host-dialog.tsx: the whole "Configure host" dialog is one
    // <form onSubmit={submit}> and SshAuthentication renders its own nested
    // <form> inside it while an OpenSSH prompt is pending.
    render(
      // eslint-disable-next-line react/jsx-no-bind
      <form onSubmit={outerSubmit}>
        <SshAuthentication output="Password:" sessionId="session-1" state="reauthentication_required" />
      </form>,
    );

    await user.type(screen.getByLabelText('SSH prompt response'), 'super-secret');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(outerSubmit).not.toHaveBeenCalled();
  });
});
