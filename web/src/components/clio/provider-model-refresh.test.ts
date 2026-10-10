import { expect, it, vi } from 'vitest';
import { vocab } from '@/lib/brand-vocabulary';
import { refreshModelsWithClient } from './provider-model-refresh';

function fixture() {
  const status = {
    installed: true,
    update_available: false,
    error: null,
    update: null,
  };
  const finished = {
    stage: 'done',
    running: false,
    changed: true,
    restart_required: false,
  };
  const result = {
    provider: 'codex',
    discovered: [],
    added: [],
    removed: [],
    unchanged: [],
    source: 'live',
    default_model: '',
    generated_at: '',
    rejected: [],
  };
  const repository = {
    providerComponents: vi.fn().mockResolvedValue(status),
    updateProviderComponents: vi.fn().mockResolvedValue(finished),
    providerComponentUpdate: vi.fn().mockResolvedValue(finished),
    refreshProviderModels: vi.fn().mockResolvedValue([result]),
  };
  const input = { repository, providerId: 'codex', providerKind: 'codex', onStage: vi.fn() };
  return { input, repository, status, finished, result };
}

it('updates the client before fetching a newly released account model', async () => {
  const { input, repository, status, result } = fixture();
  const order: string[] = [];
  repository.providerComponents.mockResolvedValue({ ...status, update_available: true });
  repository.updateProviderComponents.mockImplementation(async () => {
    order.push('update');
    return { stage: 'done', running: false, changed: true };
  });
  repository.refreshProviderModels.mockImplementation(async () => {
    order.push('models');
    return [{ ...result, added: ['gpt-6.1-sol'] }];
  });
  const outcome = await refreshModelsWithClient(input);
  expect(order).toEqual(['update', 'models']);
  expect(repository.providerComponents).toHaveBeenCalledWith('codex', { refresh: true });
  expect(outcome.notice).toContain('Found 1 new model after updating the client');
});

it('reports a current client with no new models as information', async () => {
  const { input, repository } = fixture();
  const outcome = await refreshModelsWithClient(input);
  expect(repository.updateProviderComponents).not.toHaveBeenCalled();
  expect(outcome.notice).toContain('Latest available client; no new models found');
  expect(outcome.notice).toContain('official OpenAI client update');
});

it('reacquires the Claude catalog even when the client needs a restart', async () => {
  const { input, repository, status, finished } = fixture();
  repository.providerComponents.mockResolvedValue({ ...status, update_available: true });
  repository.updateProviderComponents.mockResolvedValue({ ...finished, restart_required: true });
  const outcome = await refreshModelsWithClient({
    ...input,
    providerId: 'claude_code',
    providerKind: 'claude_code',
  });
  expect(repository.refreshProviderModels).toHaveBeenCalledWith(['claude_code']);
  expect(outcome.notice).toBe(
    `Model catalog refreshed. Client updated; restart ${vocab.agent} to use it.`,
  );
});

it('joins an already running update without starting a duplicate', async () => {
  vi.useFakeTimers();
  try {
    const { input, repository, status } = fixture();
    repository.providerComponents.mockResolvedValue({
      ...status,
      update: { stage: 'downloading', running: true },
    });
    const run = refreshModelsWithClient(input);
    await vi.advanceTimersByTimeAsync(700);
    await run;
    expect(repository.updateProviderComponents).not.toHaveBeenCalled();
    expect(repository.providerComponentUpdate).toHaveBeenCalledWith('codex');
    expect(input.onStage).toHaveBeenCalledWith('Downloading client…');
  } finally {
    vi.useRealTimers();
  }
});

it('keeps actual update failures actionable and does not claim a refreshed catalog', async () => {
  const { input, repository, status, finished } = fixture();
  repository.providerComponents.mockResolvedValue({ ...status, update_available: true });
  repository.updateProviderComponents.mockResolvedValue({
    ...finished,
    stage: 'failed',
    error: { code: 'component_in_use', message: 'Client is in use.' },
  });
  await expect(refreshModelsWithClient(input)).rejects.toThrow('Client is in use.');
  expect(repository.refreshProviderModels).not.toHaveBeenCalled();
});

it('refreshes local server models without asking for subscription client components', async () => {
  const { input, repository } = fixture();
  await refreshModelsWithClient({ ...input, providerKind: 'openai', providerId: 'vllm' });
  expect(repository.providerComponents).not.toHaveBeenCalled();
  expect(repository.refreshProviderModels).toHaveBeenCalledWith(['vllm']);
});

it('refreshes the catalog when no compatible official client release exists yet', async () => {
  const { input, repository, status } = fixture();
  repository.providerComponents.mockResolvedValue({
    ...status,
    error: { code: 'component_no_installable_release', message: 'No installable client release.' },
  });
  const outcome = await refreshModelsWithClient({
    ...input,
    providerKind: 'claude_code',
    providerId: 'claude_code',
  });
  expect(repository.updateProviderComponents).not.toHaveBeenCalled();
  expect(repository.refreshProviderModels).toHaveBeenCalledWith(['claude_code']);
  expect(outcome.notice).toContain('No compatible client update is available yet');
  expect(outcome.notice).toContain('official Anthropic client release');
});

it('reports catalogued models waiting for a newer client as information', async () => {
  const { input, repository, result } = fixture();
  repository.refreshProviderModels.mockResolvedValue([
    {
      ...result,
      rejected: [
        {
          id: 'claude-haiku-5-5',
          code: 'client_update_required',
          minimum_client_version: '2.1.293',
          reason: 'Haiku 5.5 needs a newer client.',
        },
      ],
    },
  ]);
  const outcome = await refreshModelsWithClient({
    ...input,
    providerId: 'claude_code',
    providerKind: 'claude_code',
  });
  expect(outcome.result?.failed_reason).toBeUndefined();
  expect(outcome.notice).toContain(
    '1 catalogued model needs a newer Anthropic client (2.1.293 or later)',
  );
  expect(outcome.notice).toContain('Check again after an official client update');
});
