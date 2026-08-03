import { describe, expect, it, vi } from 'vitest';
import {
  compareVersions,
  fetchLatestBackendVersion,
  normalizeVersion,
  parseGithubRepo,
} from '../../src/backend_update.js';

describe('parseGithubRepo', () => {
  it('parses a full github URL', () => {
    expect(parseGithubRepo('https://github.com/iowarp/clio-agent')).toEqual({
      owner: 'iowarp',
      repo: 'clio-agent',
    });
  });

  it('parses a trailing-slash + .git URL', () => {
    expect(parseGithubRepo('https://github.com/iowarp/clio-agent.git/')).toEqual({
      owner: 'iowarp',
      repo: 'clio-agent',
    });
  });

  it('parses a bare owner/repo slug', () => {
    expect(parseGithubRepo('iowarp/clio-agent')).toEqual({ owner: 'iowarp', repo: 'clio-agent' });
  });

  it('returns null for a non-github URL', () => {
    expect(parseGithubRepo('https://gitlab.com/x/y')).toBeNull();
    expect(parseGithubRepo('not a url')).toBeNull();
  });
});

describe('normalizeVersion / compareVersions', () => {
  it('strips a leading v', () => {
    expect(normalizeVersion('v0.5.2')).toBe('0.5.2');
    expect(normalizeVersion('  0.5.2 ')).toBe('0.5.2');
  });

  it('treats v-prefixed and bare as equal (up to date)', () => {
    expect(compareVersions('0.5.2', 'v0.5.2')).toBe('current');
  });

  it('flags a differing version as available', () => {
    expect(compareVersions('0.1.0', 'v0.5.2')).toBe('available');
  });

  it('is unknown when either side is missing', () => {
    expect(compareVersions(null, 'v0.5.2')).toBe('unknown');
    expect(compareVersions('0.5.2', null)).toBe('unknown');
    expect(compareVersions(undefined, undefined)).toBe('unknown');
  });
});

describe('fetchLatestBackendVersion', () => {
  const repo = { label: 'github.com/iowarp/clio-agent', url: 'https://github.com/iowarp/clio-agent', detail: 'CLIO backend' };

  it('returns the tag_name from the GitHub releases API', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ tag_name: 'v0.5.2' }), { status: 200 }),
    ) as unknown as typeof fetch;
    const v = await fetchLatestBackendVersion(repo, fetchImpl);
    expect(v).toBe('v0.5.2');
    const call = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0];
    expect(String(call)).toContain('api.github.com/repos/iowarp/clio-agent/releases/latest');
  });

  it('returns null on a non-200', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 403 })) as unknown as typeof fetch;
    expect(await fetchLatestBackendVersion(repo, fetchImpl)).toBeNull();
  });

  it('returns null on a thrown fetch (offline)', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await fetchLatestBackendVersion(repo, fetchImpl)).toBeNull();
  });

  it('returns null for an unparseable repo URL', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const v = await fetchLatestBackendVersion(
      { ...repo, url: 'https://gitlab.com/x/y' },
      fetchImpl,
    );
    expect(v).toBeNull();
    expect((fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls.length).toBe(0);
  });
});
