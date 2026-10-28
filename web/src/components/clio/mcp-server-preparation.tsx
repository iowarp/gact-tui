import type { McpServerDefinition } from '@clio/core/v3';
import { mcpServerPreparation } from '@/lib/mcp-preparation';
import { cn } from '@/lib/utils';
import { RefreshButton } from './refresh-button';
import { TechnicalDetails } from './technical-details';

/**
 * What a conversation's MCP server is doing while it is prepared, or why it could
 * not be: one plain sentence, the typed reason and the agent's detail behind Details,
 * and Reconnect when the server failed and can be prepared again here.
 */
export function McpServerPreparationNote({
  server,
  title,
  onReconnect,
  reconnecting = false,
  className,
}: {
  server: McpServerDefinition | undefined;
  /** The server's name as the list shows it, for the Reconnect control's label. */
  title: string;
  onReconnect?: () => unknown | Promise<unknown>;
  reconnecting?: boolean;
  className?: string;
}) {
  const view = mcpServerPreparation(server);
  if (!view) return null;
  return (
    <div className={cn('mt-1 grid gap-1 text-xs', className)}>
      <p className={view.state === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>
        {view.sentence}
      </p>
      {view.reason || view.detail ? (
        <TechnicalDetails contentClassName="mt-1 grid gap-1" title="Details">
          {view.reason ? (
            <p className="text-muted-foreground">
              Reason <code className="font-mono text-foreground">{view.reason}</code>
            </p>
          ) : null}
          {view.detail ? (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-muted/50 p-2 font-mono text-[11px] text-foreground">
              {view.detail}
            </pre>
          ) : null}
        </TechnicalDetails>
      ) : null}
      {onReconnect && view.state === 'failed' ? (
        <RefreshButton
          className="mt-1 w-fit"
          label={`Reconnect ${title}`}
          onRefresh={onReconnect}
          refreshing={reconnecting}
          size="sm"
          variant="outline"
        >
          Reconnect
        </RefreshButton>
      ) : null}
    </div>
  );
}
