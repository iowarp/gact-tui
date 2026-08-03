/**
 * Lazy loader for highlight.js.
 *
 * highlight.js (even the `lib/common` subset) is ~155 kB gzip and was
 * statically imported by both the transcript code blocks and the diff
 * pane, inflating the initial app chunk. Loading it through a dynamic
 * `import()` lets the bundler split it into its own async chunk so the
 * first paint no longer pays for it.
 *
 * Consumers:
 *   1. Call `getHljs()` once (it caches the import promise) and flip a
 *      signal when it resolves, re-running their highlight memo.
 *   2. Render unhighlighted (escaped) source until then so there is no
 *      blank flash and SSR-less unit tests still see content.
 *
 * `hljsSync()` returns the instance once it has loaded, or null before
 * that — handy for synchronous render paths that want to highlight
 * immediately on a subsequent re-render without re-awaiting.
 */
import type hljs from 'highlight.js/lib/common';

type Hljs = typeof hljs;

let cached: Promise<Hljs> | null = null;
let instance: Hljs | null = null;

/**
 * Resolve the highlight.js instance, importing it on first call. The
 * returned promise is cached so repeat callers share one network/chunk
 * fetch and one module instance.
 */
export function getHljs(): Promise<Hljs> {
  if (instance) return Promise.resolve(instance);
  if (!cached) {
    cached = import('highlight.js/lib/common').then((mod) => {
      instance = mod.default;
      return instance;
    });
  }
  return cached;
}

/**
 * The highlight.js instance if it has already loaded, else null. Never
 * triggers the import itself — pair it with `getHljs()` to kick off the
 * load.
 */
export function hljsSync(): Hljs | null {
  return instance;
}
