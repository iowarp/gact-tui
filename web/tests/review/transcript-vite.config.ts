import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { mergeConfig } from 'vite';
import baseConfig from '../../vite.config.ts';

export default mergeConfig(baseConfig, {
  cacheDir: resolve(import.meta.dirname, '../../../node_modules/.vite-transcript-review'),
  plugins: [
    {
      name: 'review-windows-junction-font-urls',
      enforce: 'post',
      transform(code: string, id: string) {
        // Cross-drive junctions produce invalid absolute font URLs on Windows.
        // Serve the same installed files through this review's dependency root.
        if (!id.includes('.css')) return;
        return code.replace(
          /\/@fs\/[^)\s"']*\/node_modules\/(@fontsource-variable\/[^/]+\/files\/)/gu,
          '/node_modules/$1',
        );
      },
    },
  ],
  server: {
    host: '127.0.0.1',
    port: 5214,
    strictPort: true,
    fs: {
      allow: [
        resolve(import.meta.dirname, '../../..'),
        realpathSync(resolve(import.meta.dirname, '../../node_modules')),
        realpathSync(resolve(import.meta.dirname, '../../node_modules/@fontsource-variable/inter')),
        realpathSync(
          resolve(import.meta.dirname, '../../node_modules/@fontsource-variable/jetbrains-mono'),
        ),
      ],
    },
  },
});
