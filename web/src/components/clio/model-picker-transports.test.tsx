import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import {
  codexOptions,
  codexTransports,
  defaultConfiguration,
  footerButtonNames,
  renderPicker,
  repository,
  setWideViewport,
} from '@/test-fixtures/model-picker/provider-actions';
import { ClioModelPicker } from './model-picker';

vi.mock('@/hooks/use-repository', async () => {
  const fixtures = await import('@/test-fixtures/model-picker/provider-actions');
  return { useRepository: () => fixtures.repository };
});
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
  // Queued one-shot results must never leak into the next test.
  for (const mock of Object.values(repository)) mock.mockReset();
});

beforeEach(() => {
  setWideViewport(true);
  repository.languageModelConfiguration.mockResolvedValue(defaultConfiguration);
  repository.providerCatalog.mockResolvedValue({ authoritative: 'live_handshake', providers: [] });
  repository.providerModels.mockResolvedValue({ provider_id: 'codex', models: [], source: 'live' });
});

function section(transport: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-slot="cascader-column-section"][data-section="${transport}"]`);
}

function loginBlock(transport: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-slot="transport-login"][data-transport="${transport}"]`);
}

async function openCodex(transports: ReturnType<typeof codexTransports>) {
  const user = userEvent.setup();
  renderPicker(
    <ClioModelPicker
      model="gpt-5.6-luna"
      onChange={vi.fn()}
      options={codexOptions(transports)}
      provider="codex"
      trigger={<Button>Change model</Button>}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Change model' }));
  return user;
}

describe('ClioModelPicker: a provider reachable two ways (Codex)', () => {
  it('both signed in: SDK and Direct each list their models, one "or", one action row', async () => {
    await openCodex(codexTransports('ready'));

    expect(within(section('sdk')!).getByText('SDK')).toBeVisible();
    expect(within(section('sdk')!).getByText('Luna')).toBeVisible();
    expect(within(section('direct')!).getByText('Direct')).toBeVisible();
    expect(within(section('direct')!).getByText('Luna')).toBeVisible();
    expect(document.querySelectorAll('[data-slot="transport-separator"]')).toHaveLength(1);
    // Refresh and Reload models act on both halves; Log out only on Direct.
    expect(footerButtonNames()).toEqual(['Refresh', 'Reload models', 'Log out']);
    // No status sentences, no developer strings.
    expect(screen.queryByText(/sign-in is required|explicit provider check/iu)).toBeNull();
  });

  it('Direct signed out: the SDK lists its models, then "or", Direct and ONE Log in', async () => {
    await openCodex(codexTransports('signed_out'));

    expect(within(section('sdk')!).getByText('Luna')).toBeVisible();
    expect(section('direct')).toBeNull();
    const direct = loginBlock('direct')!;
    expect(within(direct).getByText('Direct')).toBeVisible();
    expect(within(direct).getByRole('button', { name: 'Log in' })).toBeVisible();
    // Device code is a secondary choice behind the chevron, not a second button.
    expect(within(direct).queryByRole('button', { name: /code/iu })).toBeNull();
    expect(within(direct).getByRole('button', { name: 'More ways to log in' })).toBeVisible();
    expect(document.querySelectorAll('[data-slot="transport-separator"]')).toHaveLength(1);
    expect(footerButtonNames()).toEqual(['Refresh', 'Reload models']);
    expect(repository.authenticateProvider).not.toHaveBeenCalled();
    // No gap under a short list: the SDK section is sized to its rows (it only
    // shrinks and scrolls when it outgrows the column), Direct follows it, and
    // the free space collects above the action row.
    expect(section('sdk')?.className).not.toMatch(/flex-1|basis-0/u);
    const bounds = direct.closest('[data-slot="cascader-column-bounds"]') as HTMLElement;
    const order = [...bounds.querySelectorAll('[data-slot="cascader-column-section"], [data-slot="transport-login"], [data-slot="panel-spacer"], [data-slot="provider-panel-footer"]')].map(
      (node) => node.getAttribute('data-slot'),
    );
    expect(order).toEqual(['cascader-column-section', 'transport-login', 'panel-spacer', 'provider-panel-footer']);
  });

  it('SDK unavailable and Direct signed in: only Direct, no "or"', async () => {
    await openCodex(codexTransports('ready', 'unavailable'));

    expect(section('sdk')).toBeNull();
    expect(screen.queryByText('SDK')).toBeNull();
    expect(within(section('direct')!).getByText('Luna')).toBeVisible();
    expect(document.querySelector('[data-slot="transport-separator"]')).toBeNull();
    expect(footerButtonNames()).toEqual(['Refresh', 'Reload models', 'Log out']);
  });

  it('SDK unavailable and Direct signed out: just Direct and Log in', async () => {
    await openCodex(codexTransports('signed_out', 'unavailable'));

    expect(screen.queryByText('SDK')).toBeNull();
    expect(document.querySelector('[data-slot="transport-separator"]')).toBeNull();
    expect(within(loginBlock('direct')!).getByRole('button', { name: 'Log in' })).toBeVisible();
  });

  it("starting Direct's log in shows its progress in the Direct half only", async () => {
    repository.authenticateProvider.mockResolvedValueOnce({
      provider_id: 'codex',
      flow_id: 'flow-1',
      browser: { authorization_url: 'https://auth.openai.com/oauth/authorize?state=1', loopback: true },
      instructions: '',
    });
    repository.providerAuthStatus.mockResolvedValue({ state: 'pending', reason: '' });
    vi.spyOn(window, 'open').mockImplementation(() => window);
    const user = await openCodex(codexTransports('signed_out'));

    await user.click(within(loginBlock('direct')!).getByRole('button', { name: 'Log in' }));

    await waitFor(() =>
      expect(repository.authenticateProvider).toHaveBeenCalledWith('codex', {
        force: true,
        method: 'browser',
      }),
    );
    const direct = loginBlock('direct')!;
    expect(await within(direct).findByLabelText('Complete Codex Direct sign-in')).toBeVisible();
    expect(within(direct).getByRole('status')).toHaveTextContent('Waiting for you to log in…');
    // The SDK half never shows Direct's sign-in or its progress.
    const sdk = section('sdk')!;
    expect(within(sdk).queryByRole('status')).toBeNull();
    expect(sdk.querySelector('[data-slot="provider-action-steps"]')).toBeNull();
    expect(document.querySelectorAll('[data-slot="provider-action-steps"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-slot="provider-auth-panel"]')).toHaveLength(1);
    // Nor does the shared action row.
    expect(document.querySelector('[data-slot="provider-panel-stage"]')).toBeNull();
  });

  it('logging in with a code is reached from the Log in chevron', async () => {
    repository.authenticateProvider.mockResolvedValueOnce({
      provider_id: 'codex',
      flow_id: 'flow-2',
      device: { user_code: 'ABCD-EFGH', verification_url: 'https://auth.openai.com/device' },
      instructions: '',
    });
    repository.providerAuthStatus.mockResolvedValue({ state: 'pending', reason: '' });
    const user = await openCodex(codexTransports('signed_out'));

    await user.click(screen.getByRole('button', { name: 'More ways to log in' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Log in with a code instead' }));

    await waitFor(() =>
      expect(repository.authenticateProvider).toHaveBeenCalledWith('codex', {
        force: true,
        method: 'device',
      }),
    );
    expect(await within(loginBlock('direct')!).findByText('ABCD-EFGH')).toBeVisible();
  });

  it('an SDK the service never asked is checked when shown, once, with the check visible', async () => {
    let finish: (value: unknown) => void = () => {};
    repository.providerHandshake.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await openCodex(codexTransports('signed_out', 'unchecked'));

    await waitFor(() =>
      expect(repository.providerHandshake).toHaveBeenCalledWith('codex', {
        apiBase: 'local://codex-sdk',
        refresh: true,
      }),
    );
    expect(await within(section('sdk')!).findByRole('status')).toHaveTextContent('Checking…');
    finish({ connectivity: 'ok', auth: 'ok', models: [], source: 'live', generated_at: '' });
    // The SDK half is re-read with a live catalog probe (its only probe path).
    await waitFor(() =>
      expect(repository.providerCatalog).toHaveBeenCalledWith(true, undefined, 'codex'),
    );
    expect(repository.providerHandshake).toHaveBeenCalledTimes(1);
  });

  it('Log out acts on Direct only, and its progress shows in the Direct half', async () => {
    let finish: (value: unknown) => void = () => {};
    repository.logoutProvider.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const user = await openCodex(codexTransports('ready'));

    await user.click(screen.getByRole('button', { name: 'Log out' }));

    await waitFor(() => expect(repository.logoutProvider).toHaveBeenCalledWith('codex'));
    expect(within(section('direct')!).getByRole('status')).toHaveTextContent('Logging out…');
    expect(within(section('sdk')!).queryByRole('status')).toBeNull();
    expect(document.querySelector('[data-slot="provider-panel-stage"]')).toBeNull();
    finish({ is_authenticated: false, instructions: '' });
  });

  it.each(['sdk', 'direct'])('the %s half chosen: only that half reads selected', async (chosen) => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderPicker(
      <ClioModelPicker
        model="gpt-5.6-luna"
        onChange={onChange}
        options={codexOptions(codexTransports('ready'))}
        provider="codex"
        transport={chosen}
        trigger={<Button>Change model</Button>}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Change model' }));
    const other = chosen === 'sdk' ? 'direct' : 'sdk';
    const row = (half: string) =>
      within(section(half)!).getByText('Luna').closest('[data-slot="cascader-item"]');

    expect(row(chosen)).toHaveAttribute('aria-selected', 'true');
    expect(row(other)).not.toHaveAttribute('aria-selected', 'true');

    // Picking the other half hands back THAT half's row.
    await user.click(within(section(other)!).getByText('Luna'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'gpt-5.6-luna', transport: other }));
  });
});
