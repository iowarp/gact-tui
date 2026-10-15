import { describe, expect, it } from 'vitest';
import { DESKTOP_APP_ORIGINS, hostOriginFor } from './host-origin';

describe('hostOriginFor', () => {
  it('is the page itself when the web app serves the viewer', () => {
    expect(hostOriginFor({ origin: 'https://clio.example', search: '' })).toBe(
      'https://clio.example',
    );
  });

  it.each(DESKTOP_APP_ORIGINS)('accepts the desktop app origin %s', (origin) => {
    const search = `?host=${encodeURIComponent(origin)}`;
    expect(hostOriginFor({ origin: 'gact-viewer://localhost', search })).toBe(origin);
  });

  it('ignores a host that is not the desktop app', () => {
    const search = `?host=${encodeURIComponent('https://evil.example')}`;
    expect(hostOriginFor({ origin: 'gact-viewer://localhost', search })).toBe(
      'gact-viewer://localhost',
    );
  });
});
