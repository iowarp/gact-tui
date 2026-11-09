import { afterEach, describe, expect, it } from 'vitest';
import { clearDesktopHost, mockDesktopHost } from '@/test/desktop-host';
import { inTauri, resetDesktopHostDetection } from './tauri-runtime';

describe('inTauri', () => {
  afterEach(clearDesktopHost);

  it('is false in a plain browser', () => {
    expect(inTauri()).toBe(false);
  });

  it('is false in another Tauri WebView showing an agent-served page (#739)', () => {
    Object.assign(window, { __TAURI_INTERNALS__: {} });
    resetDesktopHostDetection();

    expect(inTauri()).toBe(false);
  });

  it('is true when the desktop host marks the page', () => {
    mockDesktopHost();

    expect(inTauri()).toBe(true);
  });

  it('answers once for the life of the page', () => {
    mockDesktopHost();
    expect(inTauri()).toBe(true);

    Reflect.deleteProperty(window, '__CLIO_DESKTOP__');

    expect(inTauri()).toBe(true);
  });
});
