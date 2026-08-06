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

  // Live-probed against the gact server on Windows (owner defect A1 root
  // cause, part 2): a real `.csv` read comes back `Content-Type:
  // application/vnd.ms-excel` — Python's `mimetypes.guess_type` falling
  // back to the Windows registry's CSV->Excel mapping, not `text/csv`.
  // Left unnormalized, every text/* classification a caller does on the
  // result misfires and a real CSV renders as a binary notice.
  it('normalizes the Windows vnd.ms-excel content-type for a .csv path to text/csv', async () => {
    const csv = 'Site,Latitude\nMTA1,34.05\n';
    const c = new Client({
      baseUrl: 'http://localhost:7777',
      fetch: mockFetch(
        (_url) =>
          new Response(csv, {
            status: 200,
            headers: { 'Content-Type': 'application/vnd.ms-excel' },
          }),
      ),
    });

    const content = await c.readWorkspaceFile('ws_demo', 'earthscope_stations_clean.csv');

    expect(content.media_type).toBe('text/csv');
    expect(content.source_media_type).toBe('application/vnd.ms-excel');
    expect(Buffer.from(content.data, 'base64').toString('utf-8')).toBe(csv);
  });

  it('leaves a genuinely declared, non-generic content-type alone even if the extension implies text', async () => {
    // e.g. a real .xls binary export named with a misleading extension —
    // the normalizer should not blindly trust extension over an explicit,
    // non-vague declared type it doesn't recognize as generic.
    const c = new Client({
      baseUrl: 'http://localhost:7777',
      fetch: mockFetch(
        (_url) =>
          new Response(new Uint8Array([1, 2, 3]), {
            status: 200,
            headers: { 'Content-Type': 'application/x-custom-binary' },
          }),
      ),
    });

    const content = await c.readWorkspaceFile('ws_demo', 'legacy.csv');

    expect(content.media_type).toBe('application/x-custom-binary');
  });
});
