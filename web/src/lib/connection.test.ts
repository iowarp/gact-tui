import { describe, expect, it } from 'vitest';
import { connectionIsLocal, normalizeEndpoint } from './connection';

describe('connection addresses', () => {
  it('uses explicit local ownership without treating SSH loopback tunnels as local', () => {
    const endpoint = 'http://127.0.0.1:64000';
    expect(connectionIsLocal({ endpoint }, true)).toBe(true);
    expect(connectionIsLocal({ endpoint, location: 'Local' })).toBe(true);
    expect(
      connectionIsLocal({
        endpoint,
        infrastructure: { targetId: 'local', serviceId: 'clio_agent' },
      }),
    ).toBe(true);
    expect(
      connectionIsLocal(
        {
          endpoint,
          location: 'Local',
          infrastructure: { targetId: 'ssh-target', serviceId: 'clio_agent' },
        },
        true,
      ),
    ).toBe(false);
    expect(connectionIsLocal({ endpoint, location: 'Delta' })).toBe(false);
  });
  it.each(['http://127.0.0.1:18825', 'http://localhost:8787', 'http://[::1]:8787'])(
    'recognizes a direct local browser connection without Desktop metadata: %s',
    (endpoint) => expect(connectionIsLocal({ endpoint })).toBe(true),
  );
  it.each(['https://clio.example.org', 'http://192.168.1.20:8787', 'invalid', 'file://localhost/'])(
    'keeps host-folder access for remote or unknown endpoints: %s',
    (endpoint) => expect(connectionIsLocal({ endpoint })).toBe(false),
  );
  it('normalizes a supported service address', () => {
    expect(normalizeEndpoint('http://agent.local/')).toBe('http://agent.local');
  });

  it('keeps credentials out of remembered connection addresses', () => {
    expect(() => normalizeEndpoint('https://token@agent.local')).toThrow(
      'Put access tokens in Advanced settings',
    );
  });
});
