import { defineConfig, searchForWorkspaceRoot } from 'vite';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import base from '../../vite.config.ts';

// Permit borrowed dependency assets in this review fixture without changing app defaults.
const web = fileURLToPath(new URL('../..', import.meta.url));
const require = createRequire(import.meta.url);
const fonts = ['inter', 'jetbrains-mono'].map((name) =>
  dirname(require.resolve(`@fontsource-variable/${name}/package.json`)),
);
export default defineConfig({
  ...base,
  server: {
    ...base.server,
    fs: { allow: [searchForWorkspaceRoot(web), realpathSync(`${web}/node_modules`), ...fonts] },
  },
});
