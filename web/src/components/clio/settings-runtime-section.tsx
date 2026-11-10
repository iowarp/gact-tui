import { ContextHistorySettings } from './settings-context-history';
import { UnofferedParts } from './settings-health-load-error';
import { RuntimeSettingsPanel } from './settings-runtime';

const PARTS = ['configuration', 'session retention', 'compaction history'];

/**
 * Execution & history: runtime limits, context and compaction, then Browser
 * (anchored for its navigation entry), with one save bar for every typed value.
 * Parts the agent does not offer are named together on one line.
 */
export function ExecutionHistorySettings({ initialSessionId }: { initialSessionId?: string }) {
  return (
    <UnofferedParts order={PARTS}>
      <RuntimeSettingsPanel
        exclude={['Memory']}
        insertBefore={{
          group: 'Browser',
          content: <ContextHistorySettings initialSessionId={initialSessionId} />,
        }}
        subsections={{ Browser: 'browser' }}
      />
    </UnofferedParts>
  );
}
