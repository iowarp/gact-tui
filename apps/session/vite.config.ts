import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { extname, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
// Per-app copy of the build-time brand plugin, matching the pattern the legacy
// app already uses (it must resolve `vite` from its own package). This is the
// copy that SURVIVES: the legacy tree — including its copy — is deleted
// wholesale at cutover (gact-tui#339), leaving exactly one. Brand is selected
// by a CONFIG FILE (apps/brand.config.json), never an env var — an embedding
// agent overrides it via a gitignored apps/brand.config.local.json.
import { brandPlugin, loadBrand } from './vite-plugin-brand';
import { resolveBrandConfig } from '../branding/brand-config.mjs';

const { profile: PROFILE, brandingRoot: BRANDING_ROOT } = resolveBrandConfig();

/** Build-time version stamp so a corner badge can name the exact build. */
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

const brand = loadBrand(BRANDING_ROOT, PROFILE);
const brandLogoAsset = resolveBrandLogoAsset(BRANDING_ROOT, PROFILE);

export default defineConfig({
  plugins: [
    brandPlugin(BRANDING_ROOT, PROFILE),
    react(),
    {
      // Brand the document <title> and favicon at build time so the OS window
      // title + browser tab read the selected brand (no hardcoded name).
      name: 'session-brand-html',
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
      // Emit the build marker the running app polls to detect a newer deploy.
      // Served uncached so a stale CDN copy can never mask a fresh build.
      name: 'session-version-marker',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ version: APP_VERSION.version }) + '\n',
        });
      },
      configureServer(server) {
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
    // Distinct from the legacy app's 5173 so both can run side by side while
    // the rebuild develops behind the harness.
    port: 5273,
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
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.{test,spec}.{ts,tsx}', 'src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
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
