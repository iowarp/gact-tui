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
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    exclude: ['e2e/**', 'node_modules/**'],
    minWorkers: 1,
    maxWorkers: 4,
    setupFiles: ['./src/test/setup.ts'],
  },
});
