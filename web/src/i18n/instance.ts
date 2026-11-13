import { setupI18n } from '@lingui/core';
import { compileMessage } from '@lingui/message-utils/compileMessage';
import { SOURCE_LOCALE } from './locales';

/**
 * The one translation instance every Lingui macro compiles against
 * (`runtimeConfigModule` in lingui.config.ts).
 *
 * It starts active in the source locale with no catalog: each macro call
 * carries its English message, compiled on first use, so any page, review
 * fixture or test that renders a component gets English without loading
 * anything. Because macros import this module, it is evaluated before the
 * first module that translates, so a module-level `t` never sees an inactive
 * instance.
 *
 * `bootstrapLocale` (./runtime) switches it to the user's language before the
 * application modules are imported. Changing language reloads the page, so a
 * string translated at module load is always in the active language.
 */
export const i18n = setupI18n({ locale: SOURCE_LOCALE, messages: { [SOURCE_LOCALE]: {} } });

// Source messages are compiled from their English text at first use. Catalog
// messages arrive precompiled; caching the source ones keeps a render that
// translates the same string thousands of times (a long transcript) from
// parsing it each time.
const compiled = new Map<string, ReturnType<typeof compileMessage>>();
i18n.setMessagesCompiler((message) => {
  let result = compiled.get(message);
  if (result === undefined) {
    result = compileMessage(message);
    compiled.set(message, result);
  }
  return result;
});
