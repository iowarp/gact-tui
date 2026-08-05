/**
 * Artifact preview fetch (round-3 defect 2 — "MD preview never renders").
 *
 * Diagnosed root (live probe against 127.0.0.1:17900): the S2 bytes route
 * answers a TYPED 409 `custody_not_cas` for a workspace-referenced version —
 * which is what live minting produces — carrying `details.fetch_via`, the
 * workspace file-read route that actually serves the bytes. The old inline
 * fetch treated any non-2xx as failure and swallowed it in `.catch(() => {})`,
 * so the panel never showed a preview and never said why. These cases pin the
 * redirect-following helper and its typed-failure contract.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  PreviewUnavailableError,
  fetchArtifactPreview,
  previewFromBlob,
  type PreviewTransport,
} from '../../src/detail/preview';

const CUSTODY_ENVELOPE = {
  error: {
    error: 'custody_not_cas',
    message: 'artifact bytes are workspace-referenced, not app-served',
    details: {
      artifact_id: 'artifact_56ff',
      custody: 'workspace-referenced',
      workspace_id: 'ws_eacd',
      fetch_via: '/v1/workspaces/ws_eacd/files/read?path=report.md',
    },
    recoverable: false,
  },
};

function transport(responder: (path: string) => Response | Promise<Response>): PreviewTransport {
  return { response: vi.fn(async (path: string) => responder(path)) };
}

describe('fetchArtifactPreview', () => {
  it('shapes a fetched markdown blob into the markdown preview (kind: report)', async () => {
    const client = transport(() => new Response('# Report\n\nBody text.', { status: 200 }));
    const preview = await fetchArtifactPreview(client, { id: 'artifact_1', kind: 'report' });
    expect(preview).toEqual({ kind: 'markdown', text: '# Report\n\nBody text.' });
  });

  it('follows the bytes route 409 custody_not_cas redirect to fetch_via — the live defect', async () => {
    const calls: string[] = [];
    const client = transport((path) => {
      calls.push(path);
      if (path === '/v1/artifacts/artifact_56ff/bytes') {
        return new Response(JSON.stringify(CUSTODY_ENVELOPE), { status: 409 });
      }
      if (path === '/v1/workspaces/ws_eacd/files/read?path=report.md') {
        return new Response('# EarthScope GNSS Report', { status: 200 });
      }
      return new Response('wrong route', { status: 404 });
    });
    const preview = await fetchArtifactPreview(client, {
      id: 'artifact_56ff',
      kind: 'report',
      name: 'report.md',
    });
    expect(preview).toEqual({ kind: 'markdown', text: '# EarthScope GNSS Report' });
    expect(calls).toEqual([
      '/v1/artifacts/artifact_56ff/bytes',
      '/v1/workspaces/ws_eacd/files/read?path=report.md',
    ]);
  });

  it('a non-ok WITHOUT the typed redirect raises a typed error naming the status — never silence', async () => {
    const client = transport(() => new Response('not found', { status: 404 }));
    await expect(fetchArtifactPreview(client, { id: 'artifact_x' })).rejects.toThrowError(
      PreviewUnavailableError,
    );
    await expect(
      fetchArtifactPreview(client, { id: 'artifact_x' }),
    ).rejects.toThrowError(/bytes route 404/);
  });

  it('a failing fetch_via route raises a typed error too (the redirect is not assumed good)', async () => {
    const client = transport((path) =>
      path.includes('/bytes')
        ? new Response(JSON.stringify(CUSTODY_ENVELOPE), { status: 409 })
        : new Response('gone', { status: 410 }),
    );
    await expect(
      fetchArtifactPreview(client, { id: 'artifact_56ff' }),
    ).rejects.toThrowError(/fetch_via route 410/);
  });

  it('an unreachable transport raises a typed error carrying the cause', async () => {
    const client: PreviewTransport = {
      response: vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    };
    await expect(
      fetchArtifactPreview(client, { id: 'artifact_x' }),
    ).rejects.toThrowError(/bytes route unreachable: .*ECONNREFUSED/);
  });

  it('shapes CSV for dataset kinds with header, first rows, and the honest total', async () => {
    const csv = 'site,lat\nMTA1,34.05\nP123,33.66\n';
    const client = transport(() => new Response(csv, { status: 200 }));
    const preview = await fetchArtifactPreview(client, { id: 'a', kind: 'dataset' });
    expect(preview).toEqual({
      kind: 'csv',
      header: ['site', 'lat'],
      rows: [
        ['MTA1', '34.05'],
        ['P123', '33.66'],
      ],
      totalRows: 2,
    });
  });

  it('falls back to the .md extension when the record kind is absent', async () => {
    const client = transport(() => new Response('body', { status: 200 }));
    const preview = await fetchArtifactPreview(client, { id: 'a', name: 'notes.MD' });
    expect(preview.kind).toBe('markdown');
  });

  it('shapes unknown kinds as plain text, never dropping the bytes', async () => {
    const client = transport(() => new Response('raw log line', { status: 200 }));
    const preview = await fetchArtifactPreview(client, { id: 'a', kind: 'log' });
    expect(preview).toEqual({ kind: 'text', text: 'raw log line' });
  });
});

describe('previewFromBlob', () => {
  it('mints an object URL for images instead of decoding bytes as text', async () => {
    const createObjectURL = vi.fn(() => 'blob:preview-url');
    Object.assign(URL, { createObjectURL });
    const preview = await previewFromBlob(new Blob(['png-bytes']), { id: 'a', kind: 'image' });
    expect(preview).toEqual({ kind: 'image', url: 'blob:preview-url' });
    expect(createObjectURL).toHaveBeenCalledOnce();
  });
});
