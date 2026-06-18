import { afterEach, describe, expect, test } from 'vitest';
import { inTauri } from '../../src/tauri.js';

function setWindowFlag(name: string, value: unknown) {
  Object.defineProperty(window, name, {
    value,
    configurable: true,
  });
}

afterEach(() => {
  delete (window as Window & { isTauri?: boolean }).isTauri;
  delete (window as Window & { __TAURI__?: unknown }).__TAURI__;
  delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
});

describe('Tauri runtime detection', () => {
  test('recognizes the public Tauri v2 runtime flag', () => {
    setWindowFlag('isTauri', true);

    expect(inTauri()).toBe(true);
  });

  test('keeps bridge globals as compatibility fallbacks', () => {
    setWindowFlag('__TAURI_INTERNALS__', {});

    expect(inTauri()).toBe(true);

    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    setWindowFlag('__TAURI__', {});

    expect(inTauri()).toBe(true);
  });

  test('does not classify a normal browser page as Tauri', () => {
    expect(inTauri()).toBe(false);
  });
});
