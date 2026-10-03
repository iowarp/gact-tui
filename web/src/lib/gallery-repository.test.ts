import { describe, expect, it } from 'vitest';
import { createGalleryRepository } from './gallery-repository';

describe('hurricane gallery data', () => {
  const base = {
    artifactTableQuery: () => { throw new Error('Gallery data should not call the agent service'); },
  } as unknown as Parameters<typeof createGalleryRepository>[0];
  const repository = createGalleryRepository(base);

  it('serves the bundled tracks and applies ordinary table filters', async () => {
    const all = await repository.artifactTableQuery('artifact_gallery_hurricane_tracks', { limit: 5 });
    expect(all.totalRows).toBe(212);
    expect(all.columns.storm?.[0]).toBe('HARVEY');

    const dorian = await repository.artifactTableQuery('artifact_gallery_hurricane_tracks', {
      limit: 100,
      filter: [{ column: 'storm', op: 'eq', value: 'DORIAN' }],
    });
    expect(dorian.matchedRows).toBe(70);
    expect(dorian.columns.storm).toEqual(Array(70).fill('DORIAN'));
  });
});
