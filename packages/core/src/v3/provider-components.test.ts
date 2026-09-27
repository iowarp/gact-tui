import { describe, expect, it } from 'vitest';
import { providerCatalogSchema } from './composer-schemas.js';
import { ClioRepository } from './repository.js';
import { RecordingTransport } from './recording-transport.test-helper.js';

const client = {
  source: 'installed',
  version: '0.157.1',
  path: 'C:/npm/codex.exe',
  reason: 'codex_installed_cli',
  installed_version: '0.157.1',
  bundled_version: '0.147.0',
};

const job = {
  provider_kind: 'codex',
  stage: 'downloading',
  running: true,
  from_versions: { 'openai-codex': '0.147.0' },
  to_versions: { 'openai-codex': '0.157.1' },
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
        provider_id: 'codex',
        provider_kind: 'codex',
        installed: true,
        update_available: true,
        target_version: '0.157.1',
        release_notes_url: 'https://github.com/openai/codex/releases',
        checked_at: '2026-09-26T23:05:20Z',
        components: [
          {
            distribution: 'openai-codex',
            installed_version: '0.147.0',
            latest_version: '0.157.1',
            update_available: true,
          },
        ],
        error: null,
        client,
        update: null,
      },
      { provider_id: 'codex', ...job, stage: 'checking' },
      { provider_id: 'codex', ...job },
    ]);
    const repository = new ClioRepository(transport);

    const status = await repository.providerComponents('codex', { refresh: true });
    expect(status).toMatchObject({
      update_available: true,
      target_version: '0.157.1',
      client: { source: 'installed' },
    });
    expect(status.update).toBeUndefined();
    expect(status.error).toBeUndefined();
    await expect(repository.updateProviderComponents('codex')).resolves.toMatchObject({
      stage: 'checking',
    });
    await expect(repository.providerComponentUpdate('codex')).resolves.toMatchObject({
      stage: 'downloading',
      running: true,
    });
    expect(transport.requests).toMatchObject([
      { method: 'GET', path: '/v1/providers/codex/components?refresh=true' },
      { method: 'POST', path: '/v1/providers/codex/components/update', body: {} },
      { method: 'GET', path: '/v1/providers/codex/components/update' },
    ]);
  });

  it('decodes a failed job with its typed error', async () => {
    const transport = new RecordingTransport([
      {
        provider_id: 'codex',
        ...job,
        stage: 'failed',
        running: false,
        rolled_back: true,
        error: { code: 'verify_failed', message: 'import failed' },
      },
    ]);
    const repository = new ClioRepository(transport);
    await expect(repository.providerComponentUpdate('codex')).resolves.toMatchObject({
      stage: 'failed',
      rolled_back: true,
      error: { code: 'verify_failed' },
    });
  });

  it('carries the client fact on a catalog entry and tolerates its absence', () => {
    const entry = {
      id: 'codex',
      name: 'Codex',
      kind: 'codex',
      endpoint: 'codex://direct',
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
