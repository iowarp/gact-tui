import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getUpdateChannel, setUpdateChannel } from '@/lib/update-channel';
import { AppearanceProvider } from '@/providers/appearance-provider';
import { ConversationDisplayProvider } from '@/providers/conversation-display-provider';
import { useUpdateFlowStore } from '@/store/update-flow-store';
import { GeneralSettings } from './settings-general';

const native = vi.hoisted(() => ({
  active: false,
  check: vi.fn(async () => null),
  installing: false,
}));
vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => native.active }));
vi.mock('@/tauri/desktop-updater', () => ({
  checkForDesktopUpdate: native.check,
  isDesktopUpdateInstalling: () => native.installing,
  subscribeDesktopUpdate: () => () => undefined,
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
  expect(screen.queryByRole('switch', { name: 'Enable beta updates' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Check for updates' })).not.toBeInTheDocument();
  expect(screen.queryByText('App updates')).not.toBeInTheDocument();
  expect(screen.queryByText('Installed app only')).not.toBeInTheDocument();
  expect(native.check).not.toHaveBeenCalled();
  expect(getUpdateChannel()).toBe('beta');
  fireEvent.click(screen.getByRole('switch', { name: 'Hide dot files and folders' }));
  expect(JSON.parse(localStorage.getItem('clio.appearance.v1')!)).toMatchObject({
    collapseThreshold: 8,
    hideDotFiles: false,
  });
});

it('offers native updates in General and preserves opt-in and opt-out across remounts', async () => {
  native.active = true;
  const view = renderSettings();
  const toggle = screen.getByRole('switch', { name: 'Enable beta updates' });
  expect(toggle).not.toBeChecked();
  expect(toggle).toHaveAccessibleDescription(/Beta releases may be unstable/);
  fireEvent.click(toggle);
  await waitFor(() => expect(screen.getByText('This app is up to date')).toBeVisible());
  expect(getUpdateChannel()).toBe('beta');
  expect(native.check).toHaveBeenCalledTimes(1);
  view.unmount();
  renderSettings();
  expect(screen.getByRole('switch', { name: 'Enable beta updates' })).toBeChecked();
  fireEvent.click(screen.getByRole('switch', { name: 'Enable beta updates' }));
  await waitFor(() => expect(screen.getByText('This app is up to date')).toBeVisible());
  expect(getUpdateChannel()).toBe('stable');
  expect(native.check).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('button', { name: 'Check for updates' })).toBeEnabled();
});

it('locks the channel during native or managed installation', () => {
  native.active = true;
  native.installing = true;
  const view = renderSettings();
  expect(screen.getByRole('switch', { name: 'Enable beta updates' })).toBeDisabled();
  view.unmount();
  native.installing = false;
  useUpdateFlowStore.getState().start('both', '0.9.5-beta.2');
  renderSettings();
  expect(screen.getByRole('switch', { name: 'Enable beta updates' })).toBeDisabled();
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
  expect(screen.getByRole('switch', { name: 'Enable beta updates' })).toBeDisabled();
  reject(new Error('Release feed unavailable'));
  await waitFor(() => expect(screen.getByText('Release feed unavailable')).toBeVisible());
  expect(screen.getByRole('button', { name: 'Check for updates' })).toBeEnabled();
  expect(screen.getByRole('switch', { name: 'Enable beta updates' })).toBeEnabled();
});
