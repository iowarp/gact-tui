import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { mergeConfig } from 'vite';
import baseConfig from '../../vite.config.ts';

// Review checkouts can share dependencies through a junction. Serve the actual
// font assets too, so the browser review does not qualify fallback typography.
export default mergeConfig(baseConfig, {
  server: {
    host: '127.0.0.1',
    port: 5212,
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
