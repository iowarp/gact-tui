import { describe, expect, it } from 'vitest';
import { RecordingTransport } from './recording-transport.test-helper.js';
import { ClioRepository } from './repository.js';
import {
  deltaWith,
  emptyAgentDelta,
  pluginChangeCompactionError,
  pluginReferenceId,
} from './plugin-domain.js';

const resolution = {
  agent: { ref: 'clio/standard', id: 'standard', name: 'CLIO', kind: 'agent' },
  plugins: [
    {
      id: 'core',
      kind: 'plugin',
      marketplace: 'clio-builtin',
      provenance: { source: 'core', via: 'core', label: 'core' },
      removable: false,
    },
    {
      id: 'xlsx',
      kind: 'plugin',
      marketplace: 'clio',
      provenance: { source: 'pack', via: 'documents', label: 'pack documents' },
      requires: ['document-runtime'],
    },
    {
      id: 'future',
      provenance: { source: 'mirror', via: 'x', label: 'x' },
    },
  ],
  prompt: {
    text: 'You are CLIO.\n\n# Capabilities\nServer-rendered guidance.\n',
    sections: [
      { section: 'identity', fragments: [{ id: 'standard.identity', plugin: 'agent:standard' }] },
    ],
  },
};

describe('PluginRepository contracts', () => {
  it('reads plugins, marketplaces and agents with forward-compatible values', async () => {
    const transport = new RecordingTransport([
      {
        plugins: [
          { id: 'documents', ref: 'clio/documents', kind: 'pack', members: ['pdf', 'xlsx'] },
          { id: 'x', ref: 'lab/x', kind: 'bundle', trusted: false, pending_trust: true },
        ],
        default_marketplace_error: null,
      },
      { marketplaces: [{ name: 'lab', source: 'https://example.org/lab.git', trusted: false }] },
      {
        agents: [
          { ref: 'clio/standard', id: 'standard', name: 'CLIO', plugins: [{ ref: 'core' }] },
          {
            ref: 'user/mine',
            id: 'mine',
            kind: 'user',
            extends: 'clio/standard',
            delta: { add: ['hdf5'], remove: ['xlsx'] },
          },
        ],
      },
    ]);
    const repository = new ClioRepository(transport);

    const catalog = await repository.plugins();
    expect(catalog.plugins.map((row) => row.kind)).toEqual(['pack', 'unknown']);
    expect(catalog.plugins[0]?.members).toEqual(['pdf', 'xlsx']);
    expect(catalog.default_marketplace_error).toBeNull();
    expect((await repository.pluginMarketplaces())[0]).toMatchObject({
      name: 'lab',
      trusted: false,
      default: false,
    });
    const agents = await repository.agents();
    expect(agents[1]).toMatchObject({ kind: 'user', delta: { add: ['hdf5'], remove: ['xlsx'] } });
    expect(transport.requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      'GET /v1/plugins',
      'GET /v1/plugins/marketplaces',
      'GET /v1/agents',
    ]);
  });

  it('previews resolutions and removals and pins the whole session delta', async () => {
    const transport = new RecordingTransport([
      resolution,
      {
        plugin: 'document-runtime',
        removes: [{ id: 'xlsx', reason: { reason: 'cascade', because: 'document-runtime' } }],
        tools_removed: ['prepare_document'],
      },
      {
        session_id: 'sess 1',
        delta: { add: ['hdf5'], remove: [] },
        resolution,
        prompt_basis: { digest: 'b', pending: true, added: ['hdf5'] },
        compaction: {
          compacted: false,
          error: { error: { error: 'compaction_failed', message: 'model timed out' } },
        },
      },
      { ref: 'user/mine', id: 'mine', kind: 'user', extends: 'clio/standard' },
      { deleted: 'user/mine' },
    ]);
    const repository = new ClioRepository(transport);

    const preview = await repository.resolveAgent('clio/standard', {
      add: ['hdf5'],
      remove: ['xlsx', 'pptx'],
    });
    expect(preview.plugins.map((row) => row.provenance.source)).toEqual([
      'core',
      'pack',
      'unknown',
    ]);
    expect(preview.plugins[0]?.removable).toBe(false);
    expect(preview.prompt.sections[0]?.fragments[0]?.plugin).toBe('agent:standard');
    expect(preview.prompt.text).toBe(resolution.prompt.text);
    const removal = await repository.previewPluginRemoval({
      ref: 'clio/standard',
      plugin: 'document-runtime',
      delta: { add: [], remove: [] },
    });
    expect(removal.removes[0]?.reason.reason).toBe('cascade');
    const pinned = await repository.updateSessionAgent('sess 1', {
      delta: { add: ['hdf5'], remove: [] },
      apply: 'compact',
    });
    expect(pinned.delta.add).toEqual(['hdf5']);
    expect(pinned.resolution.prompt.text).toBe(resolution.prompt.text);
    expect(pinned.prompt_basis).toMatchObject({ pending: true, added: ['hdf5'], removed: [] });
    expect(pluginChangeCompactionError(pinned.compaction)).toBe('model timed out');
    await repository.saveUserAgent({
      id: 'mine',
      extends: 'clio/standard',
      add: ['hdf5'],
      remove: ['xlsx'],
      name: 'Mine',
    });
    await repository.deleteUserAgent('mine');

    expect(transport.requests.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
      {
        method: 'GET',
        path: '/v1/agents/resolve?ref=clio%2Fstandard&add=hdf5&remove=xlsx&remove=pptx',
        body: undefined,
      },
      {
        method: 'POST',
        path: '/v1/agents/preview-removal',
        body: { ref: 'clio/standard', plugin: 'document-runtime', delta: { add: [], remove: [] } },
      },
      {
        method: 'PATCH',
        path: '/v1/sessions/sess%201/agent',
        body: { add: ['hdf5'], remove: [], apply: 'compact' },
      },
      {
        method: 'POST',
        path: '/v1/agents/user',
        body: {
          id: 'mine',
          extends: 'clio/standard',
          add: ['hdf5'],
          remove: ['xlsx'],
          name: 'Mine',
        },
      },
      { method: 'DELETE', path: '/v1/agents/user/mine', body: undefined },
    ]);
  });

  it('installs, trusts, updates, checks and uninstalls marketplaces by name', async () => {
    const summary = { marketplace: 'lab', trusted: false, plugins: ['a'], pending_trust: ['b'] };
    const transport = new RecordingTransport([
      summary,
      { ...summary, trusted: true, pending_trust: [] },
      summary,
      { source: 'lab', ok: false, targets: [], diagnostics: [], text: '0/0 passed' },
      { uninstalled: 'lab' },
    ]);
    const repository = new ClioRepository(transport);

    await expect(
      repository.installPluginMarketplace({ source: 'https://example.org/lab.git', ref: '' }),
    ).resolves.toMatchObject({ pending_trust: ['b'] });
    await expect(repository.trustPluginMarketplace('lab')).resolves.toMatchObject({
      trusted: true,
    });
    await repository.updatePluginMarketplace('lab');
    await expect(repository.checkPlugins({ installed: 'lab' })).resolves.toMatchObject({
      ok: false,
    });
    await repository.uninstallPluginMarketplace('lab');

    expect(transport.requests.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
      {
        method: 'POST',
        path: '/v1/plugins/marketplaces',
        body: { source: 'https://example.org/lab.git' },
      },
      { method: 'POST', path: '/v1/plugins/marketplaces/lab/trust', body: undefined },
      { method: 'POST', path: '/v1/plugins/marketplaces/lab/update', body: undefined },
      { method: 'POST', path: '/v1/plugins/check', body: { installed: 'lab' } },
      { method: 'DELETE', path: '/v1/plugins/marketplaces/lab', body: undefined },
    ]);
  });

  it('changes a delta the way the + menu composes it', () => {
    const base = { add: ['hdf5'], remove: ['xlsx'] };
    expect(deltaWith(base, { add: 'xlsx' })).toEqual({ add: ['hdf5'], remove: [] });
    expect(deltaWith(base, { add: 'netcdf' })).toEqual({
      add: ['hdf5', 'netcdf'],
      remove: ['xlsx'],
    });
    expect(deltaWith(base, { remove: 'hdf5' })).toEqual({ add: [], remove: ['xlsx'] });
    expect(deltaWith(base, { remove: 'pptx' })).toEqual({
      add: ['hdf5'],
      remove: ['xlsx', 'pptx'],
    });
    expect(deltaWith(base, { add: 'clio/xlsx' })).toEqual({ add: ['hdf5'], remove: [] });
    expect(deltaWith(base, { add: 'clio-kit/hdf5@^2' })).toEqual({
      add: ['clio-kit/hdf5@^2'],
      remove: ['xlsx'],
    });
    expect(deltaWith({ add: ['clio-kit/archify'], remove: [] }, { remove: 'archify' })).toEqual(
      emptyAgentDelta,
    );
    expect(pluginReferenceId('iowarp-clio-coder/archify@1.2')).toBe('archify');
  });
});

describe('plugin review', () => {
  it('reads a review from the address a flow-trust permission names, and nothing else', async () => {
    const transport = new RecordingTransport([
      { name: 'debate', flows: [{ id: 'debate' }], reach: ['network'], authored_by_clio: true },
    ]);
    const repository = new ClioRepository(transport);
    const review = await repository.pluginReview('/v1/plugins/debate/review');
    expect(review).toEqual({
      name: 'debate',
      version: '',
      description: '',
      flows: [{ id: 'debate', description: '', shape: '', file: '' }],
      reach: ['network'],
      unreadable: [],
      files: {},
      files_truncated: false,
      authored_by_clio: true,
    });
    await expect(repository.pluginReview('/v1/sessions/x/messages')).rejects.toThrow(
      'Not a plugin review address',
    );
    await expect(
      repository.pluginReview('https://example.org/v1/plugins/x/review'),
    ).rejects.toThrow('Not a plugin review address');
    expect(transport.requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      'GET /v1/plugins/debate/review',
    ]);
  });
});

it('inspects one exact qualified catalog entry and preserves truncated-file boundaries', async () => {
  const transport = new RecordingTransport([
    {
      plugin: { id: 'notes', ref: 'lab/notes' },
      files: [
        { path: 'SKILL.md', text: '# Notes', bytes: 1000, truncated: true, sha256: '', error: '' },
      ],
      incomplete: true,
      reason: '',
    },
  ]);
  const repository = new ClioRepository(transport);
  const result = await repository.inspectPlugin('lab/notes', true);
  expect(transport.requests[0]?.path).toBe('/v1/plugins/inspect?ref=lab%2Fnotes&pending=true');
  expect(result.files[0]).toMatchObject({ truncated: true, sha256: '' });
});
