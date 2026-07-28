import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { extname, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { brandPlugin, loadBrand } from './vite-plugin-brand';
// Brand is selected by a CONFIG FILE (apps/brand.config.json), never an env
// var. An embedding agent overrides it WITHOUT touching tracked files via a
// gitignored apps/brand.config.local.json that can point brandingRoot at its
// OWN repo — so brand files live outside gact-tui. Neutral default: gact.
import { resolveBrandConfig } from '../branding/brand-config.mjs';

const { profile: PROFILE, brandingRoot: BRANDING_ROOT } = resolveBrandConfig();

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
const brandLogoAsset = resolveBrandLogoAsset(BRANDING_ROOT, PROFILE);

export default defineConfig({
  plugins: [
    brandPlugin(BRANDING_ROOT, PROFILE),
    solid(),
    {
      // Brand the document <title> and favicon at build time so the OS window
      // title + browser tab read the selected brand (no hardcoded "CLIO").
      name: 'gact-brand-html',
      transformIndexHtml(html) {
        let out = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${brand.name}</title>`);
        if (brandLogoAsset) {
          const href = `/assets/brand-logo${brandLogoAsset.ext}`;
          out = out.replace(
            /<link rel="icon"[^>]*>/,
            `<link rel="icon" type="${brandLogoAsset.mime}" href="${href}" />\n    <link rel="apple-touch-icon" href="${href}" />`,
          );
        } else if (brand.logoSvg) {
          const dataUri = 'data:image/svg+xml,' + encodeURIComponent(brand.logoSvg);
          out = out.replace(/href="\/favicon\.svg"/, `href="${dataUri}"`);
        }
        return out;
      },
      generateBundle() {
        if (!brandLogoAsset) return;
        this.emitFile({
          type: 'asset',
          fileName: `assets/brand-logo${brandLogoAsset.ext}`,
          source: readFileSync(brandLogoAsset.path),
        });
      },
      configureServer(server) {
        if (!brandLogoAsset) return;
        const route = `/assets/brand-logo${brandLogoAsset.ext}`;
        server.middlewares.use(route, (_req, res) => {
          res.setHeader('Content-Type', brandLogoAsset.mime);
          res.setHeader('Cache-Control', 'no-store, max-age=0');
          res.end(readFileSync(brandLogoAsset.path));
        });
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
  worker: {
    format: 'es',
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
    include: [
      'tests/**/*.{test,spec}.{ts,tsx}',
      // Co-located unit tests next to the source module they lock.
      'src/**/*.{test,spec}.{ts,tsx}',
    ],
    exclude: ['tests/visual/**', 'node_modules/**'],
  },
});

function resolveBrandLogoAsset(
  brandingRoot: string,
  profile: string,
): { path: string; ext: string; mime: string } | null {
  const dir = resolve(brandingRoot, profile);
  const jsonPath = resolve(dir, 'brand.json');
  if (!existsSync(jsonPath)) return null;
  const raw = JSON.parse(readFileSync(jsonPath, 'utf8')) as { logoImage?: string };
  if (!raw.logoImage) return null;
  const path = resolve(dir, raw.logoImage);
  if (!existsSync(path)) return null;
  const ext = extname(path).toLowerCase() || '.png';
  return { path, ext, mime: mimeTypeForAssetExt(ext) };
}

function mimeTypeForAssetExt(ext: string): string {
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}
