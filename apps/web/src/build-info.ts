// Build-time version info, injected by vite `define` (see vite.config.ts).
// `__APP_VERSION__` is the repo-wide `git describe` stamp; `__APP_DIRTY__` flags
// a build from a working tree with uncommitted changes. The `typeof` guards keep
// this safe in any context where define did not run (e.g. a bare ts-node import).

declare const __APP_VERSION__: string;
declare const __APP_DIRTY__: boolean;

export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

export const APP_DIRTY: boolean =
  typeof __APP_DIRTY__ === 'boolean' ? __APP_DIRTY__ : false;
