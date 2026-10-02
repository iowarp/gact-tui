import { describe, expect, it } from 'vitest';
import { providerCatalogSchema } from './composer-schemas.js';
import { ClioRepository } from './repository.js';
import { RecordingTransport } from './recording-transport.test-helper.js';

const client = {
  source: 'installed',
  version: '0.157.1',
  path: 'C:/npm/claude.exe',
  reason: 'claude_installed_newer',
  installed_version: '0.157.1',
  bundled_version: '0.147.0',
};

const job = {
  provider_kind: 'claude_code',
  stage: 'downloading',
  running: true,
  from_versions: { 'claude-agent-sdk': '0.147.0' },
  to_versions: { 'claude-agent-sdk': '0.157.1' },
  changed: false,
  rolled_back: false,
  restart_required: false,
  error: null,
  started_at: '2026-09-26T23:06:23Z',
  finished_at: '',
};

describe('ClioRepository provider components', () => {
  it('reads the update check, starts an update and polls its stage', async () => {
    const transport = new RecordingTransport([
      {
        provider_id: 'claude_code',
        provider_kind: 'claude_code',
        installed: true,
        update_available: true,
        target_version: '0.157.1',
        release_notes_url: 'https://github.com/anthropics/claude-agent-sdk-python/releases',
        checked_at: '2026-09-26T23:05:20Z',
        components: [
          {
            distribution: 'claude-agent-sdk',
            installed_version: '0.147.0',
            latest_version: '0.157.1',
            update_available: true,
          },
        ],
        error: null,
        client,
        update: null,
      },
      { provider_id: 'claude_code', ...job, stage: 'checking' },
      { provider_id: 'claude_code', ...job },
    ]);
    const repository = new ClioRepository(transport);

    const status = await repository.providerComponents('claude_code', { refresh: true });
    expect(status).toMatchObject({
      update_available: true,
      target_version: '0.157.1',
      client: { source: 'installed' },
    });
    expect(status.update).toBeUndefined();
    expect(status.error).toBeUndefined();
    await expect(repository.updateProviderComponents('claude_code')).resolves.toMatchObject({
      stage: 'checking',
    });
    await expect(repository.providerComponentUpdate('claude_code')).resolves.toMatchObject({
      stage: 'downloading',
      running: true,
    });
    expect(transport.requests).toMatchObject([
      { method: 'GET', path: '/v1/providers/claude_code/components?refresh=true' },
      { method: 'POST', path: '/v1/providers/claude_code/components/update', body: {} },
      { method: 'GET', path: '/v1/providers/claude_code/components/update' },
    ]);
  });

  it('decodes a failed job with its typed error', async () => {
    const transport = new RecordingTransport([
      {
        provider_id: 'claude_code',
        ...job,
        stage: 'failed',
        running: false,
        rolled_back: true,
        error: { code: 'verify_failed', message: 'import failed' },
      },
    ]);
    const repository = new ClioRepository(transport);
    await expect(repository.providerComponentUpdate('claude_code')).resolves.toMatchObject({
      stage: 'failed',
      rolled_back: true,
      error: { code: 'verify_failed' },
    });
  });

  it('carries the client fact on a catalog entry and tolerates its absence', () => {
    const entry = {
      id: 'claude_code',
      name: 'Claude Code',
      kind: 'claude_code',
      endpoint: 'claude-code://sdk',
      configuration_url: '',
      connectivity: 'ok',
      auth: 'ok',
      health: 'ready',
      freshness: { generated_at: '', source: 'live' },
      failure: '',
      models: [],
    };
    const decoded = providerCatalogSchema.parse({
      authoritative: 'live',
      providers: [
        { ...entry, client },
        { ...entry, id: 'openai', client: null },
      ],
    });
    expect(decoded.providers[0]?.client).toMatchObject({ source: 'installed', version: '0.157.1' });
    expect(decoded.providers[1]?.client).toBeUndefined();
  });
});
