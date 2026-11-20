import { describe, expect, it, vi } from 'vitest';
import { readArtifactWithCustodyFallback } from './artifact-custody';

describe('readArtifactWithCustodyFallback', () => {
  it('reads a recorded fetch path that is one of the service routes', async () => {
    const readPath = vi.fn(async (path: string) => path);
    await expect(
      readArtifactWithCustodyFallback('a1', '/v1/sessions/s/files/plot.png', readPath),
    ).resolves.toBe('/v1/sessions/s/files/plot.png');
  });

  it.each(['https://attacker.example/x', '//attacker.example/x', 'artifacts/a1'])(
    'ignores the recorded fetch path %j and reads the artifact route',
    async (fetchPath) => {
      const readPath = vi.fn(async (path: string) => path);
      await expect(readArtifactWithCustodyFallback('a1', fetchPath, readPath)).resolves.toBe(
        '/v1/artifacts/a1/bytes',
      );
    },
  );
});
