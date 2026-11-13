import { describe, expect, it } from 'vitest';
import { RecordingTransport } from './recording-transport.test-helper.js';
import { ClioRepository } from './repository.js';

const view = {
  enabled: true,
  auto_switch: true,
  service_url: '',
  contact_email: '',
  literature_approved: false,
  web: [
    {
      id: 'keenable',
      name: 'Keenable',
      description: 'General web search.',
      free_use: '100 searches a day',
      key_page: 'https://keenable.example/keys',
      key_benefit: 'More searches a day',
      reads_pages: false,
      key_required: false,
      has_key: false,
      declined: false,
      limited_until: null,
      limited_kind: null,
      last_answered: 1_790_000_000,
      last_failure: null,
      last_failure_kind: null,
      answered_today: 4,
      failed_today: 0,
      position: 0,
      enabled: true,
      approved: true,
    },
    {
      id: 'exa',
      name: 'Exa',
      description: 'Neural search.',
      free_use: '',
      key_page: '',
      key_benefit: '',
      reads_pages: true,
      key_required: false,
      has_key: true,
      declined: false,
      limited_until: 1_790_003_600,
      limited_kind: 'allowance_used',
      last_answered: null,
      last_failure: 1_790_000_100,
      last_failure_kind: 'allowance_used',
      answered_today: 0,
      failed_today: 2,
      position: 1,
      enabled: true,
      approved: false,
    },
  ],
  literature: [
    {
      id: 'openalex',
      name: 'OpenAlex',
      description: 'Scholarly works.',
      free_use: 'Free with an email',
      key_page: '',
      key_benefit: '',
      reads_pages: false,
      key_required: false,
      has_key: false,
      declined: false,
      limited_until: null,
      limited_kind: null,
      last_answered: null,
      last_failure: null,
      last_failure_kind: null,
      answered_today: 0,
      failed_today: 0,
      enabled: true,
    },
  ],
};

describe('search settings repository', () => {
  it('reads and updates the search sources through /v1/search/providers', async () => {
    const transport = new RecordingTransport([view, { ...view, auto_switch: false }]);
    const repository = new ClioRepository(transport);

    const settings = await repository.searchSettings();
    expect(settings.web.map((row) => row.id)).toEqual(['keenable', 'exa']);
    expect(settings.web[1]).toMatchObject({ limited_kind: 'allowance_used', position: 1 });
    expect(settings.literature[0]?.enabled).toBe(true);

    const updated = await repository.updateSearchSettings({
      web_order: ['exa', 'keenable'],
      auto_switch: false,
    });
    expect(updated.auto_switch).toBe(false);
    expect(transport.requests.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
      { method: 'GET', path: '/v1/search/providers', body: undefined },
      {
        method: 'PATCH',
        path: '/v1/search/providers',
        body: { web_order: ['exa', 'keenable'], auto_switch: false },
      },
    ]);
  });

  it('fills fields an older server leaves out and keeps an unknown limit kind readable', async () => {
    const transport = new RecordingTransport([
      {
        enabled: false,
        web: [{ id: 'you', name: 'You.com', limited_kind: 'paused_by_operator' }],
      },
    ]);
    const settings = await new ClioRepository(transport).searchSettings();
    expect(settings).toMatchObject({ auto_switch: true, service_url: '', literature: [] });
    expect(settings.web[0]).toMatchObject({
      enabled: true,
      approved: false,
      has_key: false,
      answered_today: 0,
      limited_kind: 'paused_by_operator',
    });
  });

  it('refuses a view without the enabled switch', async () => {
    const transport = new RecordingTransport([{ web: [] }]);
    await expect(new ClioRepository(transport).searchSettings()).rejects.toThrow();
  });

  it('saves and removes keys without ever reading one back', async () => {
    const transport = new RecordingTransport([
      { source: 'exa', saved: true, settings: view },
      { source: 'exa', removed: true },
    ]);
    const repository = new ClioRepository(transport);

    const saved = await repository.saveSearchSourceKey('exa', 'sk-test', 'first');
    expect(saved.saved).toBe(true);
    expect(JSON.stringify(saved)).not.toContain('sk-test');
    await repository.removeSearchSourceKey('exa');

    expect(transport.requests.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
      {
        method: 'PUT',
        path: '/v1/search/providers/exa/key',
        body: { api_key: 'sk-test', placement: 'first' },
      },
      { method: 'DELETE', path: '/v1/search/providers/exa/key', body: undefined },
    ]);
  });

  it('asks OpenAlex to email a key', async () => {
    const transport = new RecordingTransport([
      { saved: true, status: 'pending', message: 'Check your email and click the activation link' },
    ]);
    const result = await new ClioRepository(transport).requestOpenAlexKey('ada@example.org');
    expect(result.message).toContain('activation link');
    expect(transport.requests[0]).toMatchObject({
      method: 'POST',
      path: '/v1/search/openalex-key',
      body: { email: 'ada@example.org' },
    });
  });
});
