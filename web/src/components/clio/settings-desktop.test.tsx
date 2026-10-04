import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getUpdateChannel, setUpdateChannel } from '@/lib/update-channel';
import { useUpdateFlowStore } from '@/store/update-flow-store';
import { DesktopSettings } from './settings-desktop';

vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => false }));

beforeEach(() => {
  useUpdateFlowStore.getState().reset();
  localStorage.clear();
  setUpdateChannel('stable');
});
afterEach(cleanup);

describe('update channel settings', () => {
  it('explains beta instability, persists opt-in, and supports opting back out', () => {
    const view = render(<DesktopSettings />);
    const toggle = screen.getByRole('switch', { name: 'Enable beta updates' });
    expect(toggle).not.toBeChecked();
    expect(toggle).toHaveAccessibleDescription(/Beta releases may be unstable/);
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
    expect(getUpdateChannel()).toBe('beta');
    view.unmount();
    render(<DesktopSettings />);
    expect(screen.getByRole('switch', { name: 'Enable beta updates' })).toBeChecked();
    fireEvent.click(screen.getByRole('switch', { name: 'Enable beta updates' }));
    expect(getUpdateChannel()).toBe('stable');
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeDisabled();
  });

  it('locks the channel while a managed update is running', () => {
    useUpdateFlowStore.getState().start('both', '0.9.5-beta.2');
    render(<DesktopSettings />);
    expect(screen.getByRole('switch', { name: 'Enable beta updates' })).toBeDisabled();
  });
});
