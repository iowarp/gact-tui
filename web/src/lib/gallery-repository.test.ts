import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import galleryLoadProfile from './gallery-load-profile.json';
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

describe('illustrative gallery specimen', () => {
  it('ships a self-contained GLB with a clearly labelled synthetic field', async () => {
    const bytes = await readFile(resolve('public/gallery/load-specimen.glb'));
    expect(bytes.toString('ascii', 0, 4)).toBe('glTF');
    const jsonLength = bytes.readUInt32LE(12);
    const document = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength)) as {
      scenes: Array<{ extras: { clio: { contract: string; stage: string; fields: Array<{ name: string; count: number }> } } }>;
      buffers: Array<{ uri?: string }>;
    };
    expect(document.scenes[0]?.extras.clio).toMatchObject({
      contract: 'clio.fea-mesh.v1',
      stage: 'illustrative',
      fields: [{ name: 'relative_load', count: 2600 }],
    });
    expect(document.buffers[0]?.uri).toBeUndefined();
    expect(galleryLoadProfile).toHaveLength(65);
    expect(galleryLoadProfile[32]?.zone).toBe('Waist');
    expect(galleryLoadProfile[0]?.zone).toBe('Ends');
  });
});
