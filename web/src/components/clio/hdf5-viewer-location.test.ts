import { describe, expect, it } from 'vitest';
import { viewerLocation } from './hdf5-viewer-location';

describe('viewerLocation', () => {
  it('is same-origin when the web app serves the viewer', () => {
    expect(viewerLocation('https://clio.example')).toEqual({
      src: '/hdf5-viewer/index.html',
      origin: 'https://clio.example',
    });
  });

  it.each([
    ['gact-viewer://localhost/', 'gact-viewer://localhost', 'tauri://localhost'],
    ['http://gact-viewer.localhost/', 'http://gact-viewer.localhost', 'http://tauri.localhost'],
  ])('uses the desktop viewer origin from %s', (base, origin, host) => {
    expect(viewerLocation(host, base)).toEqual({
      src: `${origin}/hdf5-viewer/index.html?host=${encodeURIComponent(host)}`,
      origin,
    });
  });
});
