import { build, defineConfig } from 'vite';
import base from './vite.config.ts';
import { fileURLToPath, URL } from 'node:url';
import { resolveBrandConfig } from '../branding/brand-config.mjs';
import { brandPlugin } from './vite-plugin-brand.ts';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const brand = resolveBrandConfig();

/** A classic self-contained script works when index.html is opened via file://. */
export default defineConfig(async () => {
  const require = createRequire(import.meta.url);
  const worker = await build({
    configFile: false,
    build: {
      write: false,
      lib: {
        entry: join(
          dirname(require.resolve('maplibre-gl/dist/maplibre-gl.mjs')),
          'maplibre-gl-worker.mjs',
        ),
        name: 'ClioArchiveMapWorker',
        formats: ['iife'],
      },
    },
  });
  const workerChunk = (Array.isArray(worker) ? worker : [worker])
    .flatMap((result) => 'output' in result ? result.output : [])
    .find((output) => output.type === 'chunk');
  if (!workerChunk || workerChunk.type !== 'chunk')
    throw new Error('Offline map worker is missing.');
  return {
    ...base,
    define: {
      ...base.define,
      'process.env.NODE_ENV': JSON.stringify('production'),
      'import.meta.env.VITE_CLIO_ARCHIVE_MAP_WORKER': JSON.stringify(workerChunk.code),
    },
    plugins: [
      brandPlugin(brand.brandingRoot, brand.profile, true),
      ...(base.plugins ?? [])
        .flat()
        .filter(
          (plugin) =>
            plugin &&
            typeof plugin === 'object' &&
            'name' in plugin &&
            !['workspace-brand', 'maplibre-worker-passthrough'].includes(plugin.name),
        ),
    ],
    build: {
      emptyOutDir: false,
      outDir: process.env.CLIO_OFFLINE_OUT_DIR ?? 'dist',
      assetsInlineLimit: 100_000_000,
      cssCodeSplit: false,
      lib: {
        entry: fileURLToPath(new URL('./src/offline-review.tsx', import.meta.url)),
        name: 'ClioOfflineReview',
        formats: ['iife'],
        fileName: () => 'offline-review.js',
        cssFileName: 'offline-review',
      },
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  };
});
