import { describe, expect, it } from 'vitest';
import { ClioRepository } from './repository.js';
import { RecordingTransport } from './recording-transport.test-helper.js';

describe('ClioRepository provider contracts', () => {
  it('installs optional provider support on the connected agent', async () => {
    const transport = new RecordingTransport([
      {
        provider_id: 'claude_code',
        installed: true,
        instructions: 'Check the provider to verify sign-in.',
      },
    ]);
    const repository = new ClioRepository(transport);

    await expect(repository.installProviderSupport('claude_code')).resolves.toMatchObject({
      provider_id: 'claude_code',
      installed: true,
    });
    expect(transport.requests[0]).toMatchObject({
      method: 'POST',
      path: '/v1/providers/claude_code/install',
      body: {},
    });
  });

  it('starts and completes browser-based provider authentication', async () => {
    const transport = new RecordingTransport([
      {
        provider_id: 'argonne_metis',
        is_authenticated: false,
        instructions: 'Continue in Globus.',
        authorization_url: 'https://auth.globus.org/v2/oauth2/authorize',
        flow_id: 'flow-123',
      },
      {
        provider_id: 'argonne_metis',
        is_authenticated: true,
        instructions: 'ALCF sign-in complete.',
      },
    ]);
    const repository = new ClioRepository(transport);

    await expect(
      repository.authenticateProvider('argonne_metis', { force: true }),
    ).resolves.toMatchObject({
      flow_id: 'flow-123',
      authorization_url: 'https://auth.globus.org/v2/oauth2/authorize',
    });
    await expect(
      repository.completeProviderAuthentication('argonne_metis', {
        flowId: 'flow-123',
        authorizationCode: 'code-456',
      }),
    ).resolves.toMatchObject({ is_authenticated: true });
    expect(transport.requests).toMatchObject([
      {
        method: 'POST',
        path: '/v1/providers/argonne_metis/auth',
        body: { action: 'start', force: true },
      },
      {
        method: 'POST',
        path: '/v1/providers/argonne_metis/auth',
        body: {
          action: 'complete',
          flow_id: 'flow-123',
          authorization_code: 'code-456',
        },
      },
    ]);
  });

  it('refreshes the selected provider catalog and preserves server-reported deltas', async () => {
    const result = {
      provider: 'codex',
      discovered: [{ id: 'gpt-5.6-luna', name: 'gpt-5.6-luna' }],
      source: 'codex_app_server',
      default_model: 'gpt-5.6-luna',
      generated_at: '2026-08-23T05:00:00Z',
      added: ['gpt-5.6-luna'],
      removed: [],
      unchanged: [],
      failed_reason: null,
      rejected: [],
    };
    const transport = new RecordingTransport([{ results: [result] }]);
    const repository = new ClioRepository(transport);

    await expect(repository.refreshProviderModels(['codex'])).resolves.toMatchObject([
      {
        provider: 'codex',
        source: 'codex_app_server',
        added: ['gpt-5.6-luna'],
      },
    ]);
    expect(transport.requests[0]).toMatchObject({
      method: 'POST',
      path: '/v1/providers/models/refresh',
      body: { providers: ['codex'] },
    });
  });

  it('keeps provider models when the service reports unknown optional limits as null', async () => {
    const transport = new RecordingTransport([
      {
        models: [
          {
            id: 'sonnet',
            name: 'Claude Sonnet',
            description: 'Claude Code alias.',
            context_window: 1_000_000,
            output_limit: null,
            label: null,
          },
          {
            id: 'fable',
            name: 'Claude Fable',
            context_window: null,
            output_limit: null,
            context_source: null,
          },
        ],
        source: 'provider_alias_probe',
      },
    ]);
    const repository = new ClioRepository(transport);

    await expect(repository.providerModels('claude_code')).resolves.toEqual({
      provider_id: 'claude_code',
      models: [
        {
          id: 'sonnet',
          name: 'Claude Sonnet',
          description: 'Claude Code alias.',
          context_window: 1_000_000,
          output_limit: undefined,
          label: undefined,
        },
        {
          id: 'fable',
          name: 'Claude Fable',
          context_window: undefined,
          output_limit: undefined,
          context_source: undefined,
        },
      ],
      source: 'provider_alias_probe',
    });
  });

  it('accepts an unset service reasoning level without discarding provider discovery', async () => {
    const transport = new RecordingTransport([
      {
        configured: true,
        provider: 'codex',
        api_base: 'codex://app-server',
        model: 'gpt-5.6-luna',
        thinking_level: null,
        thinking_effective: 'default (provider default)',
        presets: [
          {
            id: 'codex',
            label: 'OpenAI Codex (subscription)',
            provider: 'codex',
            suggested_model: 'gpt-5.5',
            is_authenticated: true,
          },
          {
            id: 'claude_code',
            label: 'Claude Code (subscription)',
            provider: 'claude_code',
            suggested_model: 'sonnet',
            is_authenticated: true,
          },
        ],
      },
    ]);
    const repository = new ClioRepository(transport);

    await expect(repository.languageModelConfiguration()).resolves.toMatchObject({
      provider: 'codex',
      model: 'gpt-5.6-luna',
      thinking_level: undefined,
      presets: [{ id: 'codex' }, { id: 'claude_code' }],
    });
  });

  it('normalizes the service zero max-token sentinel to an unset limit', async () => {
    const transport = new RecordingTransport([
      {
        configured: false,
        provider: 'lm_studio',
        api_base: 'http://127.0.0.1:1234/v1',
        model: '',
        max_tokens: 0,
        presets: [],
      },
    ]);
    const repository = new ClioRepository(transport);

    await expect(repository.languageModelConfiguration()).resolves.toMatchObject({
      configured: false,
      max_tokens: undefined,
    });
  });

  it('waits for the LM provider with a request budget that outlives the server-side wait', async () => {
    const transport = new RecordingTransport([
      {
        configured: true,
        provider: 'codex',
        api_base: 'codex://app-server',
        model: 'gpt-5.6-luna',
        presets: [],
      },
    ]);
    const repository = new ClioRepository(transport);

    await expect(repository.waitLanguageModelConfiguration()).resolves.toMatchObject({
      configured: true,
      provider: 'codex',
    });
    expect(transport.requests[0]).toMatchObject({
      method: 'GET',
      // The server caps `timeout` at 600s; request it explicitly rather than
      // relying on the server's 60s default.
      path: '/v1/providers/lm/wait?timeout=600',
      // Only a transport that enforces its own timeout honours this (the
      // desktop Tauri bridge's default is 30s, well short of a 600s wait);
      // the browser transport ignores it and leaves the wait to fetch/abort.
      timeoutMs: 610_000,
    });
  });

  it('runs a report-only provider handshake with an explicit refresh', async () => {
    const report = {
      models: [{ id: 'gpt-5.6-luna', context_window: 400000 }],
      source: 'codex_app_server',
      connectivity: 'ok',
      auth: 'not_required',
      latency_ms: 18.4,
      generated_at: '2026-08-23T05:00:00Z',
      error: null,
    };
    const transport = new RecordingTransport([report]);
    const repository = new ClioRepository(transport);

    await expect(
      repository.providerHandshake('codex subscription', { refresh: true }),
    ).resolves.toMatchObject({ connectivity: 'ok', auth: 'not_required', latency_ms: 18.4 });
    expect(transport.requests[0]).toMatchObject({
      method: 'GET',
      path: '/v1/providers/codex%20subscription/handshake?refresh=true',
    });
  });
});
