import { describe, expect, it } from 'vitest';
import { Client } from '../src/client/http.js';

describe('Client SSE URLs', () => {
  it('builds SSE URL with auth_token query param', () => {
    const c = new Client({ baseUrl: 'http://localhost:7777', bearerToken: 'tok' });
    const url = new URL(c.sseUrl('sess_abc'));
    expect(url.pathname).toBe('/v1/sessions/sess_abc/events');
    expect(url.searchParams.get('auth_token')).toBe('tok');
  });
});
