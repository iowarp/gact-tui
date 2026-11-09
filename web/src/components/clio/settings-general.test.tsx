import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getUpdateChannel, setUpdateChannel } from '@/lib/update-channel';
import { AppearanceProvider } from '@/providers/appearance-provider';
import { ConversationDisplayProvider } from '@/providers/conversation-display-provider';
import { useUpdateFlowStore } from '@/store/update-flow-store';
import { GeneralSettings } from './settings-general';
import { vocab } from '@/lib/brand-vocabulary';
import type { DesktopUpdateSnapshot } from '@/tauri/desktop-updater';

const native = vi.hoisted(() => ({
  active: false,
  check: vi.fn(async () => null),
  installing: false,
  snapshot: { status: 'unknown' } as DesktopUpdateSnapshot,
  listeners: new Set<() => void>(),
}));
vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => native.active }));
vi.mock('@/tauri/desktop-updater', () => ({
  checkForDesktopUpdate: async () => {
    native.snapshot = { status: 'checking' };
    native.listeners.forEach((notify) => notify());
    try {
      const result = await native.check();
      native.snapshot = { status: 'current' };
      native.listeners.forEach((notify) => notify());
      return result;
    } catch (error) {
      native.snapshot = {
        status: 'error',
        message: String((error as Error).message),
        reason: 'unreachable',
      };
      native.listeners.forEach((notify) => notify());
      throw error;
    }
  },
  isDesktopUpdateInstalling: () => native.installing,
  getDesktopUpdateSnapshot: () => native.snapshot,
  subscribeDesktopUpdate: (notify: () => void) => {
    native.listeners.add(notify);
    return () => native.listeners.delete(notify);
  },
  describeUpdateError: (error: Error) => error.message,
  DESKTOP_UPDATE_TOAST_ID: 'desktop-update-available',
  installDesktopUpdate: vi.fn(),
}));

function renderSettings() {
  return render(
    <AppearanceProvider>
      <ConversationDisplayProvider>
        <GeneralSettings />
      </ConversationDisplayProvider>
    </AppearanceProvider>,
  );
}

beforeEach(() => {
  native.active = false;
  native.installing = false;
  native.snapshot = { status: 'unknown' };
  native.listeners.clear();
  native.check.mockReset().mockResolvedValue(null);
  useUpdateFlowStore.getState().reset();
  localStorage.clear();
  setUpdateChannel('stable');
});
afterEach(cleanup);

it('shows shared preferences in the browser and preserves their existing saved values', () => {
  localStorage.setItem(
    'clio.appearance.v1',
    JSON.stringify({ collapseThreshold: 8, hideDotFiles: true }),
  );
  localStorage.setItem('clio.conversation-display.v1', 'full');
  setUpdateChannel('beta');
  renderSettings();
  expect(screen.getByRole('heading', { name: 'General' })).toBeVisible();
  expect(screen.getByRole('spinbutton', { name: 'Transcript preview lines' })).toHaveValue(8);
  expect(screen.getByRole('switch', { name: 'Hide dot files and folders' })).toBeChecked();
  expect(screen.queryByRole('radio', { name: 'Full activity' })).not.toBeInTheDocument();
  expect(
    screen.queryByRole('radiogroup', { name: 'Conversation activity' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('switch', { name: 'Beta updates' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Check for updates' })).not.toBeInTheDocument();
  expect(screen.queryByText(`${vocab.agent} updates`)).not.toBeInTheDocument();
  expect(screen.queryByText('Installed app only')).not.toBeInTheDocument();
  expect(native.check).not.toHaveBeenCalled();
  expect(getUpdateChannel()).toBe('beta');
  fireEvent.click(screen.getByRole('switch', { name: 'Hide dot files and folders' }));
  expect(JSON.parse(localStorage.getItem('clio.appearance.v1')!)).toMatchObject({
    collapseThreshold: 8,
    hideDotFiles: false,
  });
});

it('lets the user configure large pastes and disable conversion across restarts', () => {
  const view = renderSettings();
  const threshold = screen.getByRole('spinbutton', { name: 'Paste as source after' });
  expect(threshold).toHaveValue(4000);
  fireEvent.change(threshold, { target: { value: '8000' } });
  expect(localStorage.getItem('clio.appearance.v1')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(JSON.parse(localStorage.getItem('clio.appearance.v1')!)).toMatchObject({
    pasteSourceThreshold: 8000,
  });
  fireEvent.change(threshold, { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  view.unmount();
  renderSettings();
  expect(screen.getByRole('spinbutton', { name: 'Paste as source after' })).toHaveValue(0);
});

it('keeps an invalid preview limit staged until it is corrected or discarded', () => {
  renderSettings();
  const preview = screen.getByRole('spinbutton', { name: 'Transcript preview lines' });
  fireEvent.change(preview, { target: { value: '80' } });
  expect(screen.getByText('Enter 1 to 50.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
  expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  expect(preview).toHaveValue(5);
});

it('offers native updates in General and preserves opt-in and opt-out across remounts', async () => {
  native.active = true;
  const view = renderSettings();
  const toggle = screen.getByRole('switch', { name: 'Beta updates' });
  expect(toggle).not.toBeChecked();
  expect(toggle).toHaveAccessibleDescription(/Beta versions may be unstable/);
  fireEvent.click(toggle);
  await waitFor(() => expect(screen.getByText(`Up to date`)).toBeVisible());
  expect(getUpdateChannel()).toBe('beta');
  expect(native.check).toHaveBeenCalledTimes(1);
  view.unmount();
  renderSettings();
  expect(screen.getByRole('switch', { name: 'Beta updates' })).toBeChecked();
  fireEvent.click(screen.getByRole('switch', { name: 'Beta updates' }));
  await waitFor(() => expect(screen.getByText(`Up to date`)).toBeVisible());
  expect(getUpdateChannel()).toBe('stable');
  expect(native.check).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('button', { name: 'Check for updates' })).toBeEnabled();
});

it('locks the channel during native or managed installation', () => {
  native.active = true;
  native.installing = true;
  const view = renderSettings();
  expect(screen.getByRole('switch', { name: 'Beta updates' })).toBeDisabled();
  view.unmount();
  native.installing = false;
  useUpdateFlowStore.getState().start('both', '0.9.5-beta.2');
  renderSettings();
  expect(screen.getByRole('switch', { name: 'Beta updates' })).toBeDisabled();
});

it('shows refresh feedback until the native check completes and reports errors', async () => {
  native.active = true;
  let reject!: (error: Error) => void;
  native.check.mockImplementationOnce(
    () =>
      new Promise<null>((_resolve, failure) => {
        reject = failure;
      }),
  );
  renderSettings();
  fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
  const refresh = screen.getByRole('button', { name: 'Check for updates' });
  expect(refresh).toHaveAttribute('aria-busy', 'true');
  expect(refresh).toBeDisabled();
  expect(screen.getByRole('switch', { name: 'Beta updates' })).toBeDisabled();
  reject(new Error('Release feed unavailable'));
  await waitFor(() =>
    expect(screen.getByText('The update server could not be reached.')).toBeVisible(),
  );
  expect(screen.queryByText('Release feed unavailable')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Check for updates' })).toBeEnabled();
  expect(screen.getByRole('switch', { name: 'Beta updates' })).toBeEnabled();
});
