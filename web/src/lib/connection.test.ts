import { brand } from '@brand';
import { describe, expect, it } from 'vitest';
import {
  connectionIsLocal,
  DEFAULT_ENDPOINT,
  defaultEndpoint,
  normalizeEndpoint,
  servedEndpointFor,
} from './connection';

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
  it.each(['http://127.0.0.1:18825', 'http://localhost', 'http://[::1]'])(
    'recognizes a direct local browser connection without Desktop metadata: %s',
    (endpoint) => expect(connectionIsLocal({ endpoint })).toBe(true),
  );
  it.each(['https://clio.example.org', 'http://192.168.1.20', 'invalid', 'file://localhost/'])(
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

describe('the default service address (#739 B7)', () => {
  const page = (href: string) => {
    const url = new URL(href);
    return { origin: url.origin, port: url.port, protocol: url.protocol };
  };

  it('is the brand default port when nothing else names the agent', () => {
    expect(DEFAULT_ENDPOINT).toBe(`http://127.0.0.1:${brand.agentPort}`);
    expect(defaultEndpoint()).toBe(DEFAULT_ENDPOINT);
  });

  it.each(['http://127.0.0.1:18825/', 'https://clio.example.org/workspaces/ws'])(
    'is the serving agent itself when an agent served the page: %s',
    (href) => {
      const location = page(href);
      expect(servedEndpointFor({ desktop: false, dev: false, location })).toBe(location.origin);
    },
  );

  it.each([
    ['the desktop app', { desktop: true, dev: false, location: page('http://127.0.0.1:18825/') }],
    ['a Vite dev server', { desktop: false, dev: true, location: page('http://127.0.0.1:5251/') }],
    ['a file page', { desktop: false, dev: false, location: page('file:///tmp/index.html') }],
    ['no page', { desktop: false, dev: false }],
  ])('is not the page origin in %s', (_name, host) => {
    expect(servedEndpointFor(host)).toBeUndefined();
  });
});
