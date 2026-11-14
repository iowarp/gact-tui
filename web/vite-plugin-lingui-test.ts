import { getConfig } from '@lingui/conf';
import { mapMacroOptions, transform } from '@lingui/native-tools';
import { basename } from 'node:path';
import type { Plugin } from 'vite';

const SOURCE = /\.(?:[jt]sx?|[cm][jt]s)(?:$|\?)/u;
const MACRO_IMPORT = /from ['"]@lingui\/(?:core|react)\/macro['"]/u;

/**
 * Lingui's macro transform for Vitest.
 *
 * Vitest 2 runs on Vite 5, which `@lingui/vite-plugin` no longer supports.
 * This applies the same native transform the app build uses, keeping each
 * message's English text so components render as they do in the source locale.
 */
export function linguiMacroForTests(): Plugin {
  const config = getConfig({ cwd: import.meta.dirname });
  const macro = mapMacroOptions(config, { descriptorFields: 'all' });
  return {
    name: 'lingui-macro-for-tests',
    enforce: 'pre',
    async transform(code, id) {
      if (!SOURCE.test(id) || id.includes('/node_modules/') || !MACRO_IMPORT.test(code)) return;
      const result = await transform(code, basename(id.replace(/\?.*$/u, '')), { macro });
      return { code: result.code, map: result.map };
    },
  };
}
