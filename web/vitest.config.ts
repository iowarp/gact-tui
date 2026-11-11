import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import { resolveBrandConfig } from '../branding/brand-config.mjs';
import { brandPlugin } from './vite-plugin-brand.js';
import { jsdomTsTests } from './vitest.jsdom-files';

const brandConfig = resolveBrandConfig();

export default defineConfig({
  plugins: [brandPlugin(brandConfig.brandingRoot, brandConfig.profile), react()],
  resolve: {
    alias: {
      '@clio/core/v3': fileURLToPath(new URL('../packages/core/src/v3/index.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    environmentMatchGlobs: [
      ...jsdomTsTests.map((file): [string, 'jsdom'] => [file, 'jsdom']),
      ['**/*.test.ts', 'node'],
    ],
    // Node-environment logic tests share one module graph per thread instead of
    // re-importing it for every file; DOM tests keep isolated forks.
    poolMatchGlobs: [
      ...jsdomTsTests.map((file): [string, 'forks'] => [file, 'forks']),
      ['**/*.test.ts', 'threads'],
    ],
    poolOptions: { threads: { isolate: false } },
    exclude: ['e2e/**', 'tests/deployment/**', 'tests/review/**', 'node_modules/**'],
    minWorkers: 1,
    maxWorkers: 4,
    setupFiles: ['./vitest.setup.ts'],
  },
});
