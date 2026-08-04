/**
 * Self-update check, ported from the legacy tree (`web.old/src/updateCheck.ts`).
 *
 * This corrects a wrong assumption of mine. I recorded "update available" as a
 * BACKEND gap and filed clio-agent#1175 asking for an update-check endpoint.
 * It was never a backend concern: vite emits `/version.json` next to the
 * bundle and the running build compares it against its own git-describe stamp.
 * The new app already emits that marker, so the semantic was always available
 * client-side.
 *
 * The logic is framework-free here; the legacy version wrapped it in Solid
 * signals, which is exactly the part that does not port.
 */
import { describe, expect, it, vi } from 'vitest';
import { fetchDeployedVersion, isNewerBuild } from '../../src/wire/updateCheck';

describe('isNewerBuild', () => {
  it('reports an update when the deployed marker differs', () => {
    expect(isNewerBuild('abc1234', 'def5678')).toBe(true);
  });

  it('reports nothing when they match', () => {
    expect(isNewerBuild('abc1234', 'abc1234')).toBe(false);
  });

  it('no-ops for an unstamped build', () => {
    // A bare checkout reports "dev"; there is no meaningful newer build to
    // compare against, and claiming one would be noise on every dev run.
    expect(isNewerBuild('dev', 'abc1234')).toBe(false);
  });

  it('ignores a dirty-suffix difference against the same commit', () => {
    // A dirty working tree is the SAME build as far as the user is concerned;
    // prompting them to reload their own uncommitted work would be wrong.
    expect(isNewerBuild('abc1234-dirty', 'abc1234')).toBe(false);
    expect(isNewerBuild('abc1234', 'abc1234-dirty')).toBe(false);
  });

  it('treats a missing deployed version as no update', () => {
    expect(isNewerBuild('abc1234', null)).toBe(false);
    expect(isNewerBuild('abc1234', '')).toBe(false);
  });
});

describe('fetchDeployedVersion', () => {
  it('reads the version out of the marker', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: 'def5678' }),
    })) as unknown as typeof fetch;

    await expect(fetchDeployedVersion(fetcher)).resolves.toBe('def5678');
  });

  it('cache-busts, or a cached marker reports the running build forever', async () => {
    const seen: string[] = [];
    const fetcher = vi.fn(async (input: unknown) => {
      seen.push(String(input));
      return { ok: true, json: async () => ({ version: 'x' }) };
    });
    await fetchDeployedVersion(fetcher as unknown as typeof fetch);
    const url = seen[0] ?? '';
    expect(url).toContain('/version.json');
    expect(url).toMatch(/\?/);
  });

  it('returns null when the marker is missing rather than throwing', async () => {
    // An update check must never surface an error: being offline is not a
    // failure the user needs to act on.
    const fetcher = vi.fn(async () => ({ ok: false, json: async () => ({}) }));
    await expect(fetchDeployedVersion(fetcher as unknown as typeof fetch)).resolves.toBeNull();
  });

  it('returns null when the fetch rejects', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('offline');
    });
    await expect(fetchDeployedVersion(fetcher as unknown as typeof fetch)).resolves.toBeNull();
  });

  it('returns null on a marker with no version field', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    await expect(fetchDeployedVersion(fetcher as unknown as typeof fetch)).resolves.toBeNull();
  });
});
