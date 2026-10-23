import { fileURLToPath, URL } from 'node:url';
import { build, type Plugin } from 'vite';

/** Served and emitted beside each page; a classic script, so the desktop CSP's `script-src 'self'` allows it. */
export const THEME_BOOT_PATH = '/theme-boot.js';
const entry = fileURLToPath(new URL('./src/theme/boot.ts', import.meta.url));
const themeDirectory = fileURLToPath(new URL('./src/theme/', import.meta.url));

async function bundleBoot(development: boolean): Promise<string> {
  const output = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [
      {
        // A library build always reads as production; the page decides whether
        // development-only themes (Debug) are offered.
        name: 'clio-theme-boot-env',
        enforce: 'pre',
        transform: (code) => code.replaceAll('import.meta.env.DEV', JSON.stringify(development)),
      },
    ],
    build: {
      write: false,
      minify: true,
      emptyOutDir: false,
      lib: { entry, formats: ['iife'], name: 'clioThemeBoot', fileName: () => 'theme-boot.js' },
    },
  });
  const [result] = Array.isArray(output) ? output : [output];
  if (!result || !('output' in result)) throw new Error('theme boot script did not build');
  return result.output[0].code;
}

/**
 * Applies the stored theme before first paint. The boot script is built from
 * `src/theme/boot.ts`, which shares its preference logic with the React
 * provider, and every HTML page loads it ahead of its module scripts.
 */
export function themeBootPlugin(): Plugin {
  let development = false;
  let base = '/';
  let script: Promise<string> | undefined;
  const boot = () => (script ??= bundleBoot(development));
  return {
    name: 'clio-theme-boot',
    configResolved(config) {
      development = config.command === 'serve';
      base = config.base;
    },
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { src: `${base.replace(/\/$/u, '')}${THEME_BOOT_PATH}` },
          injectTo: 'head-prepend',
        },
      ];
    },
    async generateBundle() {
      this.emitFile({ type: 'asset', fileName: THEME_BOOT_PATH.slice(1), source: await boot() });
    },
    configureServer(server) {
      server.watcher.on('change', (path) => {
        if (path.startsWith(themeDirectory)) script = undefined;
      });
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== THEME_BOOT_PATH) {
          next();
          return;
        }
        boot().then(
          (code) => {
            res.setHeader('Content-Type', 'text/javascript');
            res.setHeader('Cache-Control', 'no-store');
            res.end(code);
          },
          (error: unknown) => next(error),
        );
      });
    },
  };
}
