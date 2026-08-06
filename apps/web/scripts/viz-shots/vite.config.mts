/**
 * Dev server for the viz bench (scripts/viz-shots/main.tsx). Root is this
 * directory, so the bench page is NEVER an entry of the production build — the
 * app's own `vite build` only ever sees apps/web/index.html.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: {
      '@clio/core': resolve(__dirname, '../../../core/src/index.ts'),
    },
  },
  server: { port: 4194, strictPort: true, fs: { allow: ['../../..'] } },
});
