import { ContextHistorySettings } from './settings-context-history';
import { RuntimeSettingsPanel } from './settings-runtime';

/**
 * Execution & history: runtime limits, context and compaction, then Browser
 * (anchored for its navigation entry), with one save bar for every typed value.
 */
export function ExecutionHistorySettings({ initialSessionId }: { initialSessionId?: string }) {
  return (
    <RuntimeSettingsPanel
      exclude={['Memory']}
      insertBefore={{
        group: 'Browser',
        content: <ContextHistorySettings initialSessionId={initialSessionId} />,
      }}
      subsections={{ Browser: 'browser' }}
    />
  );
}
