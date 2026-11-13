import type { ClioRepository, McpAppSavedDownload } from '@clio/core/v3';
import { Maximize2Icon, PanelsTopLeftIcon, SquareArrowOutUpRightIcon } from 'lucide-react';
import { useCallback, useContext, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { OPEN_BROWSER_PAGE_EVENT, type OpenBrowserPageDetail } from '@/lib/html-in-browser';
import type { BridgeHooks } from './mcp-app-bridge';
import {
  adoptMcpAppTab,
  focusMcpAppTab,
  markMcpAppEnded,
  mcpAppLabel,
  noteMcpApp,
  openMcpAppInTab,
  useMcpAppPresence,
} from './mcp-app-live-set';
import { McpAppHistoryLine, McpAppSurface } from './mcp-app-surface';
import { PresentationNavigation } from './presentation-navigation';
import { IconButton } from './primitives/icon-button';
import type { McpAppTabTarget } from './workbench-shared';

export interface McpAppBlockFields {
  app_instance_id: string;
  data_ref: string;
  resource_uri: string;
  source_server: string;
  tool_name: string;
  height?: number;
  title?: string;
}

/** A link a view opened shows in the in-app browser; a download is announced with its file. */
export function useMcpAppHostHooks(sessionId: string): Required<
  Pick<BridgeHooks, 'onBrowserPage' | 'onDownloaded'>
> {
  const navigation = useContext(PresentationNavigation);
  const openFile = navigation?.onOpenFile;
  const onBrowserPage = useCallback(
    (page: { id: string; title?: string; host?: string }) => {
      window.dispatchEvent(
        new CustomEvent<OpenBrowserPageDetail>(OPEN_BROWSER_PAGE_EVENT, {
          detail: { pageId: page.id, sessionId, label: page.title || page.host || 'Page' },
        }),
      );
    },
    [sessionId],
  );
  const onDownloaded = useCallback(
    (files: readonly McpAppSavedDownload[]) => {
      for (const file of files) {
        toast.success(`Saved ${file.name} to the workspace`, {
          description: file.artifact_id ? 'Listed in Artifacts' : undefined,
          action: openFile ? { label: 'Open', onClick: () => openFile(file.path) } : undefined,
        });
      }
    },
    [openFile],
  );
  return { onBrowserPage, onDownloaded };
}

export function mcpAppTarget(block: McpAppBlockFields, sessionId: string): McpAppTabTarget {
  return {
    label: mcpAppLabel(block.tool_name, block.source_server, block.title),
    appInstanceId: block.app_instance_id,
    dataRef: block.data_ref,
    sessionId,
    resourceUri: block.resource_uri,
    sourceServer: block.source_server,
    toolName: block.tool_name,
  };
}

/**
 * An App's card in the conversation (MA2, MA3). The conversation's latest App
 * shows its view here; while the App is in a tab the card says so and focuses
 * the tab; an App that is neither is a history line.
 */
export function McpAppCard({
  block,
  repository,
  sessionId,
}: {
  block: McpAppBlockFields;
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
  if (placement === 'surface' || placement === 'ended' || !latest) {
    return <McpAppHistoryLine sourceServer={block.source_server} toolName={block.tool_name} />;
  }
  return (
    <McpAppSurface
      actions={
        <IconButton
          icon={<Maximize2Icon />}
          label="Open in tab"
          onClick={() => openMcpAppInTab(target, repository)}
          tooltipSide="bottom"
        />
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
