import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { brandPlugin, loadBrand, activeProfile } from './vite-plugin-brand';

const BRANDING_ROOT = resolve(__dirname, '../branding');
const PROFILE = activeProfile();

// Build-time version stamp so a corner badge can tell the user exactly which
// build they're running. Prefer the repo-wide `git describe` (same stamp the
// TUI shows, e.g. v0.3.0-2098-g31c252e7[-dirty]); fall back to package.json.
function resolveAppVersion(): { version: string; dirty: boolean } {
  try {
    const v = execSync("git describe --tags --match 'v[0-9]*' --always --dirty", {
      cwd: __dirname,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (v) return { version: v, dirty: v.endsWith('-dirty') };
  } catch {
    // not a git checkout — fall through to package.json
  }
  try {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as {
      version?: string;
    };
    if (pkg.version) return { version: `v${pkg.version}`, dirty: false };
  } catch {
    // no readable package.json
  }
  return { version: 'dev', dirty: false };
}
const APP_VERSION = resolveAppVersion();

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
    {
      // Emit a tiny build marker the running app can poll to detect that a
      // newer build was deployed. Served uncached (see the dev-server header
      // below + the recommended Cache-Control on the host) so a stale CDN
      // copy can never mask a fresh deploy. Mirrors APP_VERSION exactly.
      name: 'gact-version-marker',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ version: APP_VERSION.version }) + '\n',
        });
      },
      configureServer(server) {
        // In `vite dev`/`vite preview` there is no emitted dist asset, so
        // synthesize /version.json on the fly and force no-store so the
        // update-check service can exercise its polling path locally.
        server.middlewares.use('/version.json', (_req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store, max-age=0');
          res.end(JSON.stringify({ version: APP_VERSION.version }) + '\n');
        });
      },
    },
  ],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION.version),
    __APP_DIRTY__: JSON.stringify(APP_VERSION.dirty),
  },
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
