import { describe, expect, it } from 'vitest';
import { Client } from '../src/client/http.js';

describe('Client document endpoints', () => {
  it('binds artifact reviews to the exact session, version, and hash', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const client = new Client({
      baseUrl: 'http://localhost:7777/',
      fetch: async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        requests.push({ url, init });
        return new Response(
          JSON.stringify({
            id: 'review-1',
            session_id: 'session/one',
            workspace_id: 'workspace-1',
            artifact_id: 'artifact-1',
            artifact_name: 'brief.md',
            artifact_version: 3,
            artifact_sha256: 'a'.repeat(64),
            anchor: { profile: 'text-quote', exact: 'bounded claim' },
            text: 'State the evidence boundary.',
            status: 'dispatched',
            native: false,
            created_at: '2026-07-27T00:00:00Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
    });

    await client.submitArtifactReview('session/one', {
      artifact_id: 'artifact-1',
      expected_version: 3,
      expected_sha256: 'a'.repeat(64),
      anchor: { profile: 'text-quote', exact: 'bounded claim' },
      text: 'State the evidence boundary.',
      idempotency_key: 'review-once',
    });

    expect(requests[0]?.url).toBe(
      'http://localhost:7777/v1/sessions/session%2Fone/artifact-reviews',
    );
    expect(requests[0]?.init?.method).toBe('POST');
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      artifact_id: 'artifact-1',
      expected_version: 3,
      expected_sha256: 'a'.repeat(64),
      anchor: { profile: 'text-quote', exact: 'bounded claim' },
      text: 'State the evidence boundary.',
      idempotency_key: 'review-once',
    });
  });

  it('uses revision-scoped document and embedded-editor routes', async () => {
    const urls: string[] = [];
    const client = new Client({
      baseUrl: 'http://localhost:7777',
      fetch: async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input.toString();
        urls.push(url);
        if (url.endsWith('/document/content')) {
          return new Response('document bytes', { status: 200 });
        }
        return new Response(
          JSON.stringify({
            id: 'editor-1',
            provider: 'collabora',
            working_copy_id: 'copy/one',
            launch_url: 'http://editor.invalid',
            token: 'scoped-token',
            expires_at: '2026-07-27T01:00:00Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
    });

    expect(await (await client.documentContent('artifact/one')).text()).toBe('document bytes');
    await client.createDocumentEditorSession('copy/one', 'collabora');

    expect(urls).toEqual([
      'http://localhost:7777/v1/artifacts/artifact%2Fone/document/content',
      'http://localhost:7777/v1/document-working-copies/copy%2Fone/editor-sessions',
    ]);
  });
});
