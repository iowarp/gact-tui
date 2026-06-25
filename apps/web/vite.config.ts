import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { resolve } from 'node:path';
import { brandPlugin, loadBrand, activeProfile } from './vite-plugin-brand';

// Project-owned branding: the agentic system that embeds gact-tui defines the brand
// used to compile it. `GACT_BRAND_SRC` points the build at that project's branding dir
// (e.g. clio-agent's `branding/`); it defaults to the in-repo neutral profiles under
// `apps/branding` for the standalone gact shell.
const BRANDING_ROOT = process.env['GACT_BRAND_SRC']
  ? resolve(process.env['GACT_BRAND_SRC'])
  : resolve(__dirname, '../branding');
const PROFILE = activeProfile();

// Resolve the brand once at config time so we can also drive the static
// index.html <title> + favicon (Tauri/OS document title) from the profile.
const brand = loadBrand(BRANDING_ROOT, PROFILE);

export default defineConfig({
  plugins: [
    brandPlugin(BRANDING_ROOT),
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
