import {
  MCP_APP_RETRYABLE_REOPEN_REASONS,
  type ClioRepository,
  type McpAppReopenedView,
  type McpAppSavedCall,
} from '@clio/core/v3';
import { AlertTriangleIcon, PanelsTopLeftIcon, RotateCcwIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { McpAppSurface } from './mcp-app-surface';
import { setReopenedMcpApp, useReopenedMcpApp } from './mcp-app-reopen-store';
import { humanizeToolName } from './tool-presentation';

type ReopenClient = Pick<ClioRepository, 'reopenMcpApp'>;

/**
 * Whether CLIO still holds a card's own view. Asked before mounting so that a
 * closed view reads as closed rather than as a failed descriptor request.
 */
function useHeld(
  repository: Pick<ClioRepository, 'mcpAppLive'>,
  sessionId: string,
  appInstanceId: string,
  dataRef: string,
  wanted: boolean,
): boolean | undefined {
  const [held, setHeld] = useState<{ key: string; value: boolean }>();
  const key = `${sessionId}\n${appInstanceId}\n${dataRef}`;
  useEffect(() => {
    if (!wanted) return;
    const controller = new AbortController();
    void repository
      .mcpAppLive({ sessionId, appInstanceId, dataRef }, controller.signal)
      // An unreachable CLIO lets the surface mount and report its own error.
      .catch(() => true)
      .then((value) => {
        if (!controller.signal.aborted) setHeld({ key, value });
      });
    return () => controller.abort();
  }, [appInstanceId, dataRef, key, repository, sessionId, wanted]);
  return held?.key === key ? held.value : undefined;
}

function McpAppPending() {
  return (
    <div
      aria-busy="true"
      className="flex min-h-10 items-center rounded-lg border bg-muted/20 px-3 text-sm text-muted-foreground"
    >
      Loading interactive view
    </div>
  );
}

type ReopenState =
  | { phase: 'idle' }
  | { phase: 'reopening' }
  | { phase: 'failed'; reason: string; detail: string; savedCall: McpAppSavedCall | null };

export interface McpAppReopenLineProps {
  appInstanceId: string;
  /** Replay at once instead of waiting for the person (a restored tab on first focus). */
  autoReopen?: boolean;
  onReopened: (view: McpAppReopenedView, savedCall: McpAppSavedCall | null) => void;
  repository: ReopenClient;
  sessionId: string;
  sourceServer: string;
  toolName: string;
}

/**
 * A closed view's line, with Reopen (plan MA19). Reopening replays the saved
 * opening call; a failure keeps the reason and the saved call beside Retry.
 */
export function McpAppReopenLine(props: McpAppReopenLineProps) {
  const { appInstanceId, autoReopen, onReopened, repository, sessionId } = props;
  const [state, setState] = useState<ReopenState>({ phase: 'idle' });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const reopen = useCallback(() => {
    setState({ phase: 'reopening' });
    void repository
      .reopenMcpApp(sessionId, appInstanceId)
      .then((result) => {
        if (!mounted.current) return;
        if (result.ok) {
          setState({ phase: 'idle' });
          onReopened(result.view, result.savedCall);
        } else {
          setState({
            phase: 'failed',
            reason: result.reason,
            detail: result.detail,
            savedCall: result.savedCall,
          });
        }
      })
      .catch((thrown: unknown) => {
        if (!mounted.current) return;
        setState({
          phase: 'failed',
          reason: 'request_failed',
          detail: thrown instanceof Error ? thrown.message : 'CLIO could not be reached.',
          savedCall: null,
        });
      });
  }, [appInstanceId, onReopened, repository, sessionId]);
  const started = useRef(false);
  useEffect(() => {
    if (!autoReopen || started.current) return;
    started.current = true;
    reopen();
  }, [autoReopen, reopen]);

  const displayName = humanizeToolName(props.toolName || props.sourceServer || 'interactive_tool');
  if (state.phase === 'failed') {
    const retryable =
      state.reason === 'request_failed' || MCP_APP_RETRYABLE_REOPEN_REASONS.has(state.reason);
    return (
      <Alert data-mcp-app-reopen={appInstanceId} data-reopen-reason={state.reason}>
        <AlertTriangleIcon aria-hidden="true" />
        <AlertTitle>Could not reopen {displayName}</AlertTitle>
        <AlertDescription className="grid gap-2">
          <p>{state.detail}</p>
          {state.savedCall ? <SavedCallLine call={state.savedCall} /> : null}
          {retryable ? (
            <Button className="justify-self-start" onClick={reopen} size="sm" variant="outline">
              <RotateCcwIcon aria-hidden="true" />
              Retry
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  }
  const reopening = state.phase === 'reopening';
  return (
    <div
      className="flex min-h-10 flex-wrap items-center gap-2 rounded-lg border bg-muted/20 px-3 py-1.5 text-sm"
      data-mcp-app-reopen={appInstanceId}
    >
      <PanelsTopLeftIcon aria-hidden="true" className="size-4" />
      <span className="min-w-0 flex-1 truncate text-foreground/85">{displayName}</span>
      <span aria-live="polite" className="shrink-0 text-xs text-muted-foreground">
        {reopening ? 'Reopening' : 'View closed'}
      </span>
      <Button disabled={reopening} onClick={reopen} size="sm" variant="outline">
        <RotateCcwIcon aria-hidden="true" />
        Reopen
      </Button>
    </div>
  );
}

/** The saved call, as the person can read it: service, tool and arguments. */
export function SavedCallLine({ call }: { call: McpAppSavedCall }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
      <dt className="text-muted-foreground">Saved call</dt>
      <dd className="min-w-0 break-words">
        {call.label || call.tool} from {call.server}
      </dd>
      <dt className="text-muted-foreground">With</dt>
      <dd className="min-w-0 font-mono break-words">{formatArguments(call)}</dd>
    </dl>
  );
}

export function formatArguments(call: McpAppSavedCall): string {
  if (!call.arguments) return 'arguments not saved';
  const entries = Object.entries(call.arguments);
  if (!entries.length) return 'no arguments';
  const text = entries.map(([name, value]) => `${name}: ${JSON.stringify(value)}`).join(', ');
  return text.length > 240 ? `${text.slice(0, 239)}…` : text;
}

export interface McpAppCardProps {
  appInstanceId: string;
  dataRef: string;
  height?: number;
  /** Whether the transcript keeps this card's own view live. */
  live: boolean;
  repository: ClioRepository;
  resourceUri: string;
  sessionId: string;
  sourceServer: string;
  toolName: string;
}

/** A transcript card for one MCP App: its view, or the line that reopens it. */
export function McpAppCard(props: McpAppCardProps) {
  const { appInstanceId, sessionId } = props;
  const reopened = useReopenedMcpApp(sessionId, appInstanceId);
  // The view this card shows: the one it reopened, else its own while the transcript keeps it.
  const target =
    reopened ??
    (props.live
      ? {
          appInstanceId,
          dataRef: props.dataRef,
          resourceUri: props.resourceUri,
          sourceServer: props.sourceServer,
          toolName: props.toolName,
        }
      : undefined);
  const held = useHeld(
    props.repository,
    sessionId,
    target?.appInstanceId ?? '',
    target?.dataRef ?? '',
    Boolean(target),
  );
  const onReopened = useCallback(
    (view: McpAppReopenedView) => setReopenedMcpApp(sessionId, appInstanceId, view),
    [appInstanceId, sessionId],
  );
  const line = (
    <McpAppReopenLine
      appInstanceId={appInstanceId}
      onReopened={onReopened}
      repository={props.repository}
      sessionId={sessionId}
      sourceServer={props.sourceServer}
      toolName={props.toolName}
    />
  );
  if (!target || held === false) return line;
  if (held === undefined) return <McpAppPending />;
  return (
    <McpAppSurface
      appInstanceId={target.appInstanceId}
      dataRef={target.dataRef}
      endedFallback={line}
      height={props.height}
      repository={props.repository}
      resourceUri={target.resourceUri}
      sessionId={sessionId}
      sourceServer={target.sourceServer}
      toolName={target.toolName}
    />
  );
}
