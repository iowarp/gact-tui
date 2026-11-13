import { CornerDownLeftIcon } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { useMcpAppHostHooks } from './mcp-app-host-hooks';
import {
  markMcpAppEnded,
  mcpAppIdentity,
  noteMcpApp,
  returnMcpAppToConversation,
  useMcpAppLiveSetStore,
  useMcpAppPresence,
} from './mcp-app-live-set';
import { McpAppSurface } from './mcp-app-surface';
import type { McpAppTabTarget } from './workbench-shared';

/**
 * An App in its fullscreen display mode: the tab holds the App's one frame
 * (MA1, MA3). The workbench keeps this panel mounted while other tabs are shown,
 * so switching tabs never reloads the view.
 */
export function McpAppTabPanel({ target }: { target: McpAppTabTarget }) {
  const repository = useRepository();
  const hooks = useMcpAppHostHooks(target.sessionId);
  const { latest } = useMcpAppPresence(target.appInstanceId, target.sessionId);

  // A tab restored by the workbench claims the frame: the card shows the in-tab row.
  useEffect(() => {
    const known = useMcpAppLiveSetStore.getState().apps[target.appInstanceId];
    const entry = noteMcpApp(target, repository, 'tab');
    if (known && entry.placement !== 'inline') return;
    useMcpAppLiveSetStore.setState((state) => ({
      apps: { ...state.apps, [target.appInstanceId]: { ...entry, placement: 'tab' } },
    }));
    void repository
      .setMcpAppDisplayMode(mcpAppIdentity(target), 'fullscreen')
      .catch(() => undefined);
  }, [repository, target]);

  return (
    <div className="flex h-full min-h-0 flex-col" data-mcp-app-tab={target.appInstanceId}>
      <McpAppSurface
        comments
        actions={
          latest ? (
            <Button
              onClick={() => returnMcpAppToConversation(target.appInstanceId)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <CornerDownLeftIcon aria-hidden="true" />
              Return to conversation
            </Button>
          ) : null
        }
        appInstanceId={target.appInstanceId}
        dataRef={target.dataRef}
        label={target.label}
        onBrowserPage={hooks.onBrowserPage}
        onDisplayModeChange={(mode) => {
          if (mode === 'inline') returnMcpAppToConversation(target.appInstanceId);
        }}
        onDownloaded={hooks.onDownloaded}
        onEnded={() => markMcpAppEnded(target.appInstanceId)}
        onRecordedDisplayMode={() => false}
        placement="tab"
        repository={repository}
        resourceUri={target.resourceUri}
        sessionId={target.sessionId}
        sourceServer={target.sourceServer}
        toolName={target.toolName}
      />
    </div>
  );
}
