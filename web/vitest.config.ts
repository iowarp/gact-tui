import react from '@vitejs/plugin-react';
import { globSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import { resolveBrandConfig } from '../branding/brand-config.mjs';
import { brandPlugin } from './vite-plugin-brand.js';
import { jsdomTsTests } from './vitest.jsdom-files';
import { linguiMacroForTests } from './vite-plugin-lingui-test';

const brandConfig = resolveBrandConfig();

const testExclude = ['e2e/**', 'tests/deployment/**', 'tests/review/**', 'node_modules/**'];

// Node tests share one module graph per thread. A file that replaces a module with
// vi.mock needs its own graph: a module an earlier file already loaded would keep
// the real dependency. Those few files run isolated.
const webRoot = fileURLToPath(new URL('.', import.meta.url));
const mockingNodeTests = globSync('**/*.test.ts', { cwd: webRoot, exclude: testExclude })
  .filter((file) => !jsdomTsTests.includes(file))
  .filter((file) =>
    /\bvi\.(?:do)?mock\(/u.test(readFileSync(new URL(file, import.meta.url), 'utf8')),
  );

export default defineConfig({
  plugins: [
    brandPlugin(brandConfig.brandingRoot, brandConfig.profile),
    linguiMacroForTests(),
    react(),
  ],
  resolve: {
    alias: {
      '@clio/core/v3': fileURLToPath(new URL('../packages/core/src/v3/index.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    exclude: testExclude,
    maxWorkers: 4,
    setupFiles: ['./vitest.setup.ts'],
    // Inline projects extend this root config (plugins, aliases, setup, excludes).
    projects: [
      {
        extends: true,
        test: {
          // Node-environment logic tests share one module graph per thread instead
          // of re-importing it for every file.
          name: 'node',
          include: ['**/*.test.ts'],
          exclude: [...jsdomTsTests, ...mockingNodeTests],
          environment: 'node',
          pool: 'threads',
          isolate: false,
        },
      },
      {
        extends: true,
        test: {
          name: 'node-mocked',
          include: mockingNodeTests,
          environment: 'node',
          pool: 'threads',
        },
      },
      {
        extends: true,
        test: {
          // DOM tests keep isolated forks.
          name: 'dom',
          include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)'],
          exclude: ['**/*.test.ts'],
          environment: 'jsdom',
          pool: 'forks',
        },
      },
      {
        extends: true,
        test: {
          name: 'dom-ts',
          include: [...jsdomTsTests],
          environment: 'jsdom',
          pool: 'forks',
        },
      },
    ],
  },
});
