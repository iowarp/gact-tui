import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { resolveBrandConfig } from '../branding/brand-config.mjs';
import { brandPlugin } from './vite-plugin-brand.js';

const brandConfig = resolveBrandConfig();
const remoteDevelopmentTarget = process.env.CLIO_DEV_REMOTE_ENDPOINT;

// https://vite.dev/config/
export default defineConfig({
  plugins: [brandPlugin(brandConfig.brandingRoot, brandConfig.profile), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: remoteDevelopmentTarget
      ? {
          '/__clio_remote': {
            target: remoteDevelopmentTarget,
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/__clio_remote/u, ''),
          },
        }
      : undefined,
  },
});
