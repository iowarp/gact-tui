import { describe, expect, it } from 'vitest';
import { Client } from '../src/client/http.js';

function mockFetch(handler: (url: string) => Response | Promise<Response>) {
  return (input: string | URL | Request) =>
    Promise.resolve(handler(typeof input === 'string' ? input : input.toString()));
}

describe('Client workspace file endpoints', () => {
  it('infers workspace preview media type from image path when backend returns text/plain', async () => {
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const c = new Client({
      baseUrl: 'http://localhost:7777',
      fetch: mockFetch(
        (_url) =>
          new Response(pngHeader, {
            status: 200,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          }),
      ),
    });

    const content = await c.readWorkspaceFile('ws_demo', 'validation_plot.png');

    expect(content.media_type).toBe('image/png');
    expect(content.encoding).toBe('base64');
    expect(content.data).toBe(Buffer.from(pngHeader).toString('base64'));
  });
});
