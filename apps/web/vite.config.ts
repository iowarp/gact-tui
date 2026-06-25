import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { resolve } from 'node:path';
import { brandPlugin, loadBrand } from './vite-plugin-brand';
// The shared resolver is a .mjs so it can be imported by both this TS config
// (executed by vite's node loader) and the .mjs gen script.
import { resolveBrandConfig } from '../branding/brand-config.mjs';

// Project-owned branding selected by a CONFIG FILE (never an env var): the
// agentic system that embeds gact-tui defines the brand used to compile it.
// The resolver reads apps/brand.config.json — or apps/brand.config.local.json
// when the embedding project (e.g. clio-agent) drops one pointing brandingRoot
// at its own branding/. The standalone gact shell uses the tracked default
// (profile "gact", brandingRoot "branding").
const { profile: PROFILE, brandingRoot: BRANDING_ROOT } = resolveBrandConfig();

// Resolve the brand once at config time so we can also drive the static
// index.html <title> + favicon (Tauri/OS document title) from the profile.
const brand = loadBrand(BRANDING_ROOT, PROFILE);

export default defineConfig({
  plugins: [
    brandPlugin(BRANDING_ROOT, PROFILE),
    solid(),
    {
      // Brand the document <title> and favicon at build time so the OS window
      // title + browser tab read the selected brand (no hardcoded "CLIO").
      name: 'gact-brand-html',
      transformIndexHtml(html) {
        let out = html.replace(
          /<title>[\s\S]*?<\/title>/,
          `<title>${brand.name}</title>`,
        );
        if (brand.logoSvg) {
          const dataUri =
            'data:image/svg+xml,' + encodeURIComponent(brand.logoSvg);
          out = out.replace(
            /href="\/favicon\.svg"/,
            `href="${dataUri}"`,
          );
        }
        return out;
      },
    },
  ],
  resolve: {
    alias: {
      '@clio/core': resolve(__dirname, '../core/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      allow: ['..', BRANDING_ROOT],
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['tests/visual/**', 'node_modules/**'],
  },
});
