import type { ClioRepository } from '@clio/core/v3';
import { Maximize2Icon, PanelsTopLeftIcon, SquareArrowOutUpRightIcon } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { mcpAppTarget, useMcpAppHostHooks, type McpAppBlockFields } from './mcp-app-host-hooks';
import {
  adoptMcpAppTab,
  focusMcpAppTab,
  markMcpAppEnded,
  noteMcpApp,
  openMcpAppInTab,
  useMcpAppPresence,
} from './mcp-app-live-set';
import { McpAppHistoryLine, McpAppSurface } from './mcp-app-surface';
import type { McpAppTabTarget } from './workbench-shared';

/**
 * An App's card in the conversation (MA2, MA3). The conversation's latest App
 * shows its view here; while the App is in a tab the card says so and focuses
 * the tab; an App that is neither is a history line.
 */
export function McpAppCard({
  block,
  reopened = false,
  repository,
  sessionId,
}: {
  block: McpAppBlockFields;
  /** The person reopened this view from its card (MA19): it shows here though not the latest. */
  reopened?: boolean;
  repository?: ClioRepository;
  sessionId?: string;
}) {
  const target = useMemo(
    () => (sessionId ? mcpAppTarget(block, sessionId) : undefined),
    [block, sessionId],
  );
  useEffect(() => {
    if (target) noteMcpApp(target, repository);
  }, [repository, target]);
  const { placement, latest } = useMcpAppPresence(block.app_instance_id, sessionId ?? '');
  const hooks = useMcpAppHostHooks(sessionId ?? '');

  if (!target || !repository) {
    return <McpAppHistoryLine sourceServer={block.source_server} toolName={block.tool_name} />;
  }
  if (placement === 'tab') return <McpAppInTabRow target={target} />;
  if (placement === 'surface' || placement === 'ended' || !(latest || reopened)) {
    return <McpAppHistoryLine sourceServer={block.source_server} toolName={block.tool_name} />;
  }
  return (
    <McpAppSurface
      actions={
        <Button
          onClick={() => openMcpAppInTab(target, repository)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Maximize2Icon aria-hidden="true" />
          Open in tab
        </Button>
      }
      appInstanceId={target.appInstanceId}
      dataRef={target.dataRef}
      height={block.height}
      label={target.label}
      onBrowserPage={hooks.onBrowserPage}
      onDisplayModeChange={(mode) => {
        if (mode === 'fullscreen') openMcpAppInTab(target, repository);
      }}
      onDownloaded={hooks.onDownloaded}
      onEnded={() => markMcpAppEnded(target.appInstanceId)}
      onRecordedDisplayMode={(mode) => {
        if (mode !== 'fullscreen') return false;
        adoptMcpAppTab(target.appInstanceId);
        return true;
      }}
      placement="inline"
      repository={repository}
      resourceUri={target.resourceUri}
      sessionId={target.sessionId}
      sourceServer={target.sourceServer}
      toolName={target.toolName}
    />
  );
}

/** The card of an App whose frame is in a tab: one row that focuses the tab (MA3). */
export function McpAppInTabRow({ target }: { target: McpAppTabTarget }) {
  return (
    <div
      className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg border bg-muted/20 px-3 text-sm"
      data-mcp-app-in-tab={target.appInstanceId}
    >
      <PanelsTopLeftIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-foreground/85">{target.label}</span>
      <span className="shrink-0 text-xs text-muted-foreground">Open in a tab</span>
      <Button onClick={() => focusMcpAppTab(target)} size="sm" type="button" variant="ghost">
        <SquareArrowOutUpRightIcon aria-hidden="true" />
        Show tab
      </Button>
    </div>
  );
}
