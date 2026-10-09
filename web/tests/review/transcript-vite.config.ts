import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { mergeConfig } from 'vite';
import baseConfig from '../../vite.config.ts';

export default mergeConfig(baseConfig, {
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
