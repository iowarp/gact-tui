import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_ENDPOINT, defaultEndpoint } from './connection';
import { resetDesktopHostDetection } from './transport/tauri-runtime';
import { clearDesktopHost, mockDesktopHost } from '@/test/desktop-host';

afterEach(clearDesktopHost);

it('starts from the address the desktop host resolved from the agent port configuration', () => {
  mockDesktopHost({}, { version: 'test', agentEndpoint: 'http://127.0.0.1:18825' });
  expect(defaultEndpoint()).toBe('http://127.0.0.1:18825');
});

it('starts from the brand default in a desktop host that reported no address', () => {
  mockDesktopHost({}, { version: 'test' });
  expect(defaultEndpoint()).toBe(DEFAULT_ENDPOINT);
});

it('ignores an address offered by a page that is not the desktop host', () => {
  vi.stubGlobal('__CLIO_DESKTOP__', { agentEndpoint: 'http://127.0.0.1:18825' });
  resetDesktopHostDetection();
  try {
    expect(defaultEndpoint()).toBe(DEFAULT_ENDPOINT);
  } finally {
    vi.unstubAllGlobals();
  }
});
