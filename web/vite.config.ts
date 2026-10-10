import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { resolveBrandConfig } from '../branding/brand-config.mjs';
import { brandPlugin } from './vite-plugin-brand.js';
import { maplibreWorkerPlugin } from './vite-plugin-maplibre-worker.js';
import { offlineReviewPlugin } from './vite-plugin-offline-review.js';

const brandConfig = resolveBrandConfig();
const remoteDevelopmentTarget = process.env.CLIO_DEV_REMOTE_ENDPOINT;
const galleryOnly = process.env.CLIO_GALLERY_STANDALONE === '1';
const reviewFixtures = process.env.CLIO_REVIEW_FIXTURES === '1';
const workspaceVersion = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
).version;
// A branded installer can have a different release identity from this UI.
// Bundle its own notes offline; never look up that version in the UI changelog.
const desktopChangelogPath = process.env.CLIO_DESKTOP_CHANGELOG;
const desktopChangelog = desktopChangelogPath ? readFileSync(desktopChangelogPath, 'utf8') : '';

// https://vite.dev/config/
export default defineConfig({
  base: galleryOnly ? '/widgets/' : '/',
  define: {
    'import.meta.env.VITE_CLIO_WORKSPACE_VERSION': JSON.stringify(workspaceVersion),
    'import.meta.env.VITE_CLIO_DESKTOP_CHANGELOG': JSON.stringify(desktopChangelog),
  },
  plugins: [
    brandPlugin(brandConfig.brandingRoot, brandConfig.profile),
    react(),
    tailwindcss(),
    maplibreWorkerPlugin(),
    offlineReviewPlugin(),
  ],
  resolve: {
    alias: {
      '@clio/core/v3': fileURLToPath(new URL('../packages/core/src/v3/index.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      input: galleryOnly
        ? { gallery: fileURLToPath(new URL('./widget-preview.html', import.meta.url)) }
        : {
            app: fileURLToPath(new URL('./index.html', import.meta.url)),
            gallery: fileURLToPath(new URL('./widget-preview.html', import.meta.url)),
            ...(reviewFixtures
              ? {
                  transcriptReview: fileURLToPath(
                    new URL('./tests/review/transcript-text-flow.html', import.meta.url),
                  ),
                }
              : {}),
          },
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
