import { defineConfig } from '@lingui/conf';
import { formatter } from '@lingui/format-po';
import { createSwcExtractor } from '@lingui/native-tools';

/**
 * Message catalogs for the Web and Desktop interface.
 *
 * Source copy is written in English inside the components with the Lingui
 * macros, and `pnpm i18n:extract` collects it into one PO catalog per locale.
 * See docs/i18n.md for the authoring rules.
 */
export default defineConfig({
  sourceLocale: 'en',
  locales: ['en', 'es', 'ja', 'el', 'pseudo'],
  // Accented, 30% longer copy between ⟦ ⟧: unwrapped strings and clipped
  // layouts stand out without reading another language.
  pseudoLocale: { locale: 'pseudo', prepend: '⟦', append: '⟧', extend: 0.3 },
  fallbackLocales: { default: 'en' },
  catalogs: [
    {
      path: '<rootDir>/src/locales/{locale}/messages',
      include: ['<rootDir>/src'],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '<rootDir>/src/test/**',
        '<rootDir>/src/test-fixtures/**',
      ],
    },
  ],
  format: formatter({ lineNumbers: false }),
  extractors: [createSwcExtractor()],
  orderBy: 'message',
  // Translations are resolved against one global instance that is active before
  // any module that uses a macro is evaluated (see src/i18n/instance.ts).
  runtimeConfigModule: {
    i18n: ['@/i18n/instance', 'i18n'],
    Trans: ['@/i18n/react', 'Trans'],
    useLingui: ['@/i18n/react', 'useLingui'],
  },
});
