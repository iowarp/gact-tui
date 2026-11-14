import type { ReactElement } from 'react';
import {
  type I18nContext,
  LinguiContext,
  Trans as LinguiTrans,
  type TransProps,
} from '@lingui/react';
import { i18n } from './instance';

/**
 * React runtime for the `@lingui/react/macro` `Trans` and `useLingui` macros.
 *
 * The active language never changes while a page is open (switching reloads
 * the page), so these read the global instance and need no `I18nProvider`.
 * That keeps every entry point, gallery and review fixture working without a
 * provider of its own.
 */
const context: I18nContext = {
  i18n,
  _: i18n.t.bind(i18n),
  defaultComponent: undefined,
};

// The macro runtime needs the hook beside the component; neither holds state to refresh.
// oxlint-disable-next-line react/only-export-components
export function useLingui(): I18nContext {
  return context;
}

export function Trans(props: TransProps): ReactElement {
  return (
    <LinguiContext.Provider value={context}>
      <LinguiTrans {...props} />
    </LinguiContext.Provider>
  );
}
