import { useContext, useMemo } from 'react';
import { SettingsScopeContext } from '@/lib/settings-scope-context';
import { SettingsSectionHeading } from './settings-section-heading';
import { ph, t } from '@lingui/core/macro';

/**
 * The Extensions page title. Its scope line differs from the other agent pages:
 * enabling or installing here only makes an extension available to the agent, and
 * each conversation adds what it uses (connectors per conversation, CS-D1).
 */
export function ExtensionScopeHeading() {
  const pageScope = useContext(SettingsScopeContext);
  const scope = useMemo(
    () =>
      pageScope && {
        ...pageScope,
        line: t`${ph({ place: pageScope.place })}, installed for this agent; each conversation adds what it uses`,
      },
    [pageScope],
  );
  return (
    <SettingsScopeContext.Provider value={scope}>
      <SettingsSectionHeading
        description={t`Connectors, plugins, marketplaces and skills for your agents.`}
        title={t`Extensions`}
      />
    </SettingsScopeContext.Provider>
  );
}
