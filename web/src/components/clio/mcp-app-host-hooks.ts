import type { McpAppSavedDownload } from '@clio/core/v3';
import { useCallback, useContext } from 'react';
import { toast } from 'sonner';
import { OPEN_BROWSER_PAGE_EVENT, type OpenBrowserPageDetail } from '@/lib/html-in-browser';
import type { BridgeHooks } from './mcp-app-bridge';
import { mcpAppLabel } from './mcp-app-live-set';
import { PresentationNavigation } from './presentation-navigation';
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
export function useMcpAppHostHooks(
  sessionId: string,
): Required<Pick<BridgeHooks, 'onBrowserPage' | 'onDownloaded'>> {
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
