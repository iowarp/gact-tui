/**
 * Task B5 — provider/model setup in onboarding.
 *
 * Covers curated-first ordering, ready vs needs-key card behavior, that
 * provider-select calls the right client method with the right body, and the
 * skip-persistence wiring (a returning user never re-sees onboarding).
 */
import { render, screen, cleanup, fireEvent, waitFor } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ProviderSetup,
  orderPresets,
  isReady,
  needsKey,
  statusChip,
  type LmPreset,
} from '../../src/components/ProviderSetup.js';
import {
  ONBOARDING_KEY,
  OnboardingTour,
  markOnboardingDone,
  shouldShowOnboarding,
} from '../../src/components/OnboardingTour.js';

afterEach(cleanup);

/** Presets shaped exactly like the live `/v1/providers/lm` → presets[] payload. */
const PRESETS: LmPreset[] = [
  // needs-key (req key, not ready)
  {
    id: 'openai',
    label: 'OpenAI / ChatGPT',
    provider: 'openai',
    api_base: 'https://api.openai.com/v1',
    suggested_model: 'gpt-4o-mini',
    requires_api_key: true,
    auth_method: 'api_key',
    is_authenticated: true,
    status: 'unknown',
  },
  // ready
  {
    id: 'claude_code',
    label: 'Claude Code (subscription)',
    provider: 'claude_code',
    api_base: 'claude-code://exec',
    suggested_model: 'sonnet',
    requires_api_key: false,
    auth_method: 'none',
    is_authenticated: true,
    status: 'ready',
  },
  // needs-setup (no key, not ready)
  {
    id: 'ollama',
    label: 'Ollama (localhost)',
    provider: 'ollama',
    api_base: 'http://127.0.0.1:11434/v1',
    suggested_model: 'granite3.1-dense:8b',
    requires_api_key: false,
    auth_method: 'none',
    is_authenticated: true,
    status: 'unknown',
  },
  // ready
  {
    id: 'codex',
    label: 'OpenAI Codex (subscription)',
    provider: 'codex',
    api_base: 'codex://exec',
    suggested_model: 'gpt-5.5',
    requires_api_key: false,
    auth_method: 'none',
    is_authenticated: true,
    status: 'ready',
  },
];

function fakeClient(overrides?: { setLm?: ReturnType<typeof vi.fn> }) {
  const setLm = overrides?.setLm ?? vi.fn().mockResolvedValue({ configured: true });
  const lmConfig = vi.fn().mockResolvedValue({ presets: PRESETS });
  return { setLm, lmConfig } as unknown as import('@clio/core').Client & {
    setLm: ReturnType<typeof vi.fn>;
    lmConfig: ReturnType<typeof vi.fn>;
  };
}

describe('ProviderSetup — pure helpers', () => {
  it('classifies ready / needs-key correctly', () => {
    expect(isReady(PRESETS[1]!)).toBe(true); // claude_code
    expect(isReady(PRESETS[0]!)).toBe(false); // openai unknown
    expect(needsKey(PRESETS[0]!)).toBe(true); // openai req key
    expect(needsKey(PRESETS[1]!)).toBe(false); // claude_code ready
    expect(needsKey(PRESETS[2]!)).toBe(false); // ollama no key
  });

  it('orders ready first, then needs-key, then the rest — stable within rank', () => {
    const ids = orderPresets(PRESETS).map((p) => p.id);
    // ready (claude_code, codex) keep their input order, then needs-key
    // (openai), then needs-setup (ollama).
    expect(ids).toEqual(['claude_code', 'codex', 'openai', 'ollama']);
  });

  it('statusChip reports the right tone per preset', () => {
    expect(statusChip(PRESETS[1]!)).toEqual({ label: 'Ready', tone: 'ready' });
    expect(statusChip(PRESETS[0]!)).toEqual({ label: 'Needs key', tone: 'key' });
    expect(statusChip(PRESETS[2]!)).toEqual({ label: 'Needs setup', tone: 'setup' });
  });
});

describe('ProviderSetup — rendering', () => {
  it('renders cards curated-first (ready ones at the top of the grid)', async () => {
    const client = fakeClient();
    render(() => (
      <ProviderSetup client={client} onConfigured={() => undefined} onSkip={() => undefined} />
    ));
    await waitFor(() => screen.getByTestId('provider-setup-grid'));
    const grid = screen.getByTestId('provider-setup-grid');
    const cards = grid.querySelectorAll('[data-testid^="provider-setup-card-"]');
    const order = Array.from(cards).map((c) =>
      c.getAttribute('data-testid')!.replace('provider-setup-card-', ''),
    );
    expect(order).toEqual(['claude_code', 'codex', 'openai', 'ollama']);
    // ready cards carry the data flag
    expect(
      screen.getByTestId('provider-setup-card-claude_code').getAttribute('data-ready'),
    ).toBe('1');
  });

  it('picking a READY provider configures it in one click (no key field)', async () => {
    const client = fakeClient();
    const onConfigured = vi.fn();
    render(() => (
      <ProviderSetup client={client} onConfigured={onConfigured} onSkip={() => undefined} />
    ));
    await waitFor(() => screen.getByTestId('provider-setup-card-claude_code'));
    fireEvent.click(screen.getByTestId('provider-setup-card-claude_code'));

    await waitFor(() => expect(client.setLm).toHaveBeenCalledTimes(1));
    expect(client.setLm).toHaveBeenCalledWith({
      provider: 'claude_code',
      api_base: 'claude-code://exec',
      model: 'sonnet',
    });
    // no api_key for a ready provider
    expect(client.setLm.mock.calls[0]![0]).not.toHaveProperty('api_key');
    expect(onConfigured).toHaveBeenCalledTimes(1);
    // no key field ever shown
    expect(screen.queryByTestId('provider-setup-keyform-claude_code')).toBeNull();
  });

  it('picking a NEEDS-KEY provider reveals a single key field, then configures with the key', async () => {
    const client = fakeClient();
    const onConfigured = vi.fn();
    render(() => (
      <ProviderSetup client={client} onConfigured={onConfigured} onSkip={() => undefined} />
    ));
    await waitFor(() => screen.getByTestId('provider-setup-card-openai'));

    // Picking openai does NOT configure yet — it reveals the key field.
    fireEvent.click(screen.getByTestId('provider-setup-card-openai'));
    expect(client.setLm).not.toHaveBeenCalled();
    const keyInput = screen.getByTestId('provider-setup-keyinput-openai') as HTMLInputElement;
    expect(keyInput).toBeTruthy();
    expect(keyInput.type).toBe('password');

    // Submit is disabled until a key is entered.
    const submit = screen.getByTestId('provider-setup-keysubmit-openai') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.input(keyInput, { target: { value: 'sk-live-123' } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);

    await waitFor(() => expect(client.setLm).toHaveBeenCalledTimes(1));
    expect(client.setLm).toHaveBeenCalledWith({
      provider: 'openai',
      api_base: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      api_key: 'sk-live-123',
    });
    expect(onConfigured).toHaveBeenCalledTimes(1);
  });

  it('the happy path never shows a backend URL or bearer-token field', async () => {
    const client = fakeClient();
    render(() => (
      <ProviderSetup client={client} onConfigured={() => undefined} onSkip={() => undefined} />
    ));
    await waitFor(() => screen.getByTestId('provider-setup-grid'));
    const html = screen.getByTestId('provider-setup').innerHTML.toLowerCase();
    expect(html).not.toContain('bearer');
    expect(html).not.toContain('backend url');
  });

  it('Skip-for-now points to Settings → Providers and fires onSkip', async () => {
    const client = fakeClient();
    const onSkip = vi.fn();
    render(() => (
      <ProviderSetup client={client} onConfigured={() => undefined} onSkip={onSkip} />
    ));
    await waitFor(() => screen.getByTestId('provider-setup-skip'));
    const skip = screen.getByTestId('provider-setup-skip');
    expect(skip.textContent).toContain('Settings');
    fireEvent.click(skip);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});

describe('Onboarding skip persistence (returning user)', () => {
  beforeEach(() => localStorage.removeItem(ONBOARDING_KEY));

  it('a returning user (onboarding done) never re-sees the tour', () => {
    expect(shouldShowOnboarding()).toBe(true);
    markOnboardingDone();
    expect(shouldShowOnboarding()).toBe(false);
  });
});

describe('OnboardingTour with a client', () => {
  it('inserts the provider-setup step after welcome', async () => {
    const client = fakeClient();
    render(() => <OnboardingTour open={true} onFinish={() => undefined} client={client} />);
    // step 1 = welcome, step 2 = provider setup
    fireEvent.click(screen.getByTestId('onboarding-next'));
    await waitFor(() => screen.getByTestId('provider-setup'));
    expect(screen.getByTestId('provider-setup-title').textContent).toContain('Pick a model');
  });

  it('without a client the tour is the original prose-only walkthrough', () => {
    render(() => <OnboardingTour open={true} onFinish={() => undefined} />);
    fireEvent.click(screen.getByTestId('onboarding-next'));
    // second step is the composer spotlight, not provider setup
    expect(screen.queryByTestId('provider-setup')).toBeNull();
    expect(screen.getByTestId('onboarding-title').textContent).toContain('Ask anything');
  });
});
