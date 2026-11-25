import { describe, expect, it } from 'vitest';
import { browserTabBlob } from './browser-tab-blob';

const encode = (text: string) => new TextEncoder().encode(text);
const script = '<svg xmlns="http://www.w3.org/2000/svg"><script>void 0</script></svg>';

describe('browserTabBlob', () => {
  it.each([
    'text/html',
    'application/xhtml+xml',
    'application/xml',
    'text/xml',
    'application/atom+xml',
    'application/octet-stream',
    'application/javascript',
    '',
    'TEXT/HTML',
  ])('opens %j as plain text, not a document', async (mediaType) => {
    const blob = browserTabBlob(encode(script), mediaType, 'figure.svg');
    expect(blob.type).toBe('text/plain;charset=utf-8');
    expect(await blob.text()).toBe(script);
  });

  it.each(['image/png', 'IMAGE/JPEG', 'application/pdf', 'video/mp4', 'audio/mpeg'])(
    'passes the inert type %j through',
    (mediaType) => {
      expect(browserTabBlob(encode('x'), mediaType, 'file').type).toBe(mediaType.toLowerCase());
    },
  );

  it('shows an SVG as an image inside a page that allows no script', async () => {
    const name = '"><script>x()</script>.svg';
    const blob = browserTabBlob(encode(script), 'Image/SVG+xml; charset=utf-8', name);
    expect(blob.type).toBe('text/html;charset=utf-8');
    const page = await blob.text();
    expect(page).toContain(
      `content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"`,
    );
    expect(page).not.toContain('<script');
    const source = /src="data:image\/svg\+xml;base64,([^"]+)"/u.exec(page)?.[1];
    expect(source && atob(source)).toBe(script);
  });
});
