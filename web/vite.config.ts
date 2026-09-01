import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { resolveBrandConfig } from '../branding/brand-config.mjs';
import { brandPlugin } from './vite-plugin-brand.js';

const brandConfig = resolveBrandConfig();
const remoteDevelopmentTarget = process.env.CLIO_DEV_REMOTE_ENDPOINT;
const workspaceVersion = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
).version;

// https://vite.dev/config/
export default defineConfig({
  define: {
    'import.meta.env.VITE_CLIO_WORKSPACE_VERSION': JSON.stringify(workspaceVersion),
  },
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
