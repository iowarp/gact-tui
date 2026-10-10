import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import { resolveBrandConfig } from '../branding/brand-config.mjs';
import { brandPlugin } from './vite-plugin-brand.js';

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
    exclude: ['e2e/**', 'tests/deployment/**', 'tests/review/**', 'node_modules/**'],
    minWorkers: 1,
    maxWorkers: 4,
    setupFiles: ['./src/test/setup.ts'],
  },
});
