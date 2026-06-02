import { describe, expect, it } from 'vitest';
import { getHljs, hljsSync } from '../../src/hljs-lazy.js';

describe('hljs-lazy', () => {
  it('getHljs() resolves to a highlight.js instance', async () => {
    const hljs = await getHljs();
    expect(hljs).toBeTruthy();
    expect(typeof hljs.highlight).toBe('function');
    expect(typeof hljs.getLanguage).toBe('function');
  });

  it('caches the instance across calls (same promise resolution)', async () => {
    const a = await getHljs();
    const b = await getHljs();
    // Cached module instance — referentially identical, not re-imported.
    expect(a).toBe(b);
  });

  it('hljsSync() returns the loaded instance after getHljs() resolves', async () => {
    const loaded = await getHljs();
    expect(hljsSync()).toBe(loaded);
  });

  it('getHljs() returns an immediately-resolved promise once cached', async () => {
    // Prime the cache.
    await getHljs();
    // Subsequent calls resolve synchronously from the cached instance.
    const sync = hljsSync();
    expect(sync).not.toBeNull();
    const again = await getHljs();
    expect(again).toBe(sync);
  });
});
