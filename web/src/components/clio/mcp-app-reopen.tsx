import {
  MCP_APP_RETRYABLE_REOPEN_REASONS,
  type ClioRepository,
  type McpAppReopenedView,
  type McpAppSavedCall,
} from '@clio/core/v3';
import { AlertTriangleIcon, PanelsTopLeftIcon } from 'lucide-react';
import { RetryIcon } from '@/lib/icon-vocabulary';
import { vocab } from '@/lib/brand-vocabulary';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { McpAppCard } from './mcp-app-card';
import type { McpAppBlockFields } from './mcp-app-host-hooks';
import {
  markMcpAppEnded,
  mcpAppLabel,
  noteMcpApp,
  openMcpAppInTab,
  standInForCard,
  useMcpAppLiveSetStore,
  useMcpAppPresence,
} from './mcp-app-live-set';
import {
  formatArguments,
  replaceReopenedMcpApp,
  setReopenedMcpApp,
  useMcpAppHeld,
  useReopenedMcpApp,
} from './mcp-app-reopen-store';
import { McpAppTabPanel } from './mcp-app-tab-panel';
import { humanizeToolName } from './tool-presentation';
import { mcpAppTab, type McpAppTabTarget, type WorkbenchTab } from './workbench-shared';

type ReopenClient = Pick<ClioRepository, 'reopenMcpApp'>;

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
  /** The App's name (its tool's title); the tool's name when absent. */
  label?: string;
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
          detail: thrown instanceof Error ? thrown.message : `${vocab.agent} could not be reached.`,
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

  const displayName =
    props.label || humanizeToolName(props.toolName || props.sourceServer || 'interactive_tool');
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
              <RetryIcon aria-hidden="true" />
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
        <RetryIcon aria-hidden="true" />
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

function viewTarget(view: McpAppReopenedView, sessionId: string, title?: string): McpAppTabTarget {
  return {
    label: mcpAppLabel(view.toolName, view.sourceServer, title),
    appInstanceId: view.appInstanceId,
    dataRef: view.dataRef,
    sessionId,
    resourceUri: view.resourceUri,
    sourceServer: view.sourceServer,
    toolName: view.toolName,
  };
}

/**
 * A transcript card for one MCP App, with reopening (MA19). The card shows the
 * view it reopened when it has one, else its own. A view CLIO no longer holds,
 * or an older card the live set closed, is the line that reopens it.
 */
export function McpAppReopenableCard({
  block,
  repository,
  sessionId,
}: {
  block: McpAppBlockFields;
  repository?: ClioRepository;
  sessionId?: string;
}) {
  const session = sessionId ?? '';
  const reopened = useReopenedMcpApp(session, block.app_instance_id);
  const effective = useMemo<McpAppBlockFields>(
    () =>
      reopened
        ? {
            ...block,
            app_instance_id: reopened.appInstanceId,
            data_ref: reopened.dataRef,
            resource_uri: reopened.resourceUri,
            source_server: reopened.sourceServer,
            tool_name: reopened.toolName,
          }
        : block,
    [block, reopened],
  );
  // After a reload the live set knows the reopened view only by its own id: tie it to this card.
  useEffect(() => {
    if (reopened) standInForCard(reopened.appInstanceId, block.app_instance_id);
  });
  const { placement, latest } = useMcpAppPresence(effective.app_instance_id, session);
  // Only the conversation's latest App lives inline (MA5): a reopened view mounts in its card
  // only when that card is the latest. One reopened from an older card lives in its tab.
  const cardLatest = useMcpAppLiveSetStore((state) =>
    [undefined, block.app_instance_id].includes(state.latest[session]),
  );
  const wantsFrame = placement === 'inline' && (latest || (Boolean(reopened) && cardLatest));
  const held = useMcpAppHeld(
    repository,
    session,
    effective.app_instance_id,
    effective.data_ref,
    wantsFrame && Boolean(repository && sessionId),
  );
  useEffect(() => {
    if (held === false) markMcpAppEnded(effective.app_instance_id);
  }, [effective.app_instance_id, held]);
  const onReopened = useCallback(
    (view: McpAppReopenedView) => {
      const target = viewTarget(view, session, block.title);
      setReopenedMcpApp(session, block.app_instance_id, view);
      noteMcpApp(target, repository);
      standInForCard(view.appInstanceId, block.app_instance_id);
      const latestCard = useMcpAppLiveSetStore.getState().latest[session];
      const older = latestCard !== undefined && latestCard !== block.app_instance_id;
      // An older card has no live inline place (MA5), so its view opens in its tab (MA7).
      if (view.displayMode === 'fullscreen' || older) openMcpAppInTab(target, repository);
    },
    [block.app_instance_id, block.title, repository, session],
  );

  if (!repository || !sessionId) {
    return <McpAppCard block={block} repository={repository} sessionId={sessionId} />;
  }
  const closed = placement === 'ended' || held === false || (placement === 'inline' && !wantsFrame);
  if (closed) {
    return (
      <McpAppReopenLine
        // The newest view this card showed: its saved call holds the mode it was last in.
        appInstanceId={reopened?.appInstanceId ?? block.app_instance_id}
        label={mcpAppLabel(block.tool_name, block.source_server, block.title)}
        onReopened={onReopened}
        repository={repository}
        sessionId={sessionId}
        sourceServer={block.source_server}
        toolName={block.tool_name}
      />
    );
  }
  if (wantsFrame && held === undefined) return <McpAppPending />;
  return (
    <McpAppCard
      block={effective}
      reopened={Boolean(reopened)}
      repository={repository}
      sessionId={sessionId}
    />
  );
}

/**
 * An App tab (MA1) that may have been restored after CLIO restarted (MA19).
 * While CLIO holds the view it is the ordinary tab panel. A restored tab whose
 * view CLIO no longer holds replays its saved call the first time it is shown,
 * then becomes the fresh view's tab; a failed replay stays in the tab with the
 * reason, the saved call and Retry.
 */
export function McpAppRestoringTab({
  onReplaceTab,
  target,
}: {
  onReplaceTab: (tabId: string, replacement: WorkbenchTab) => void;
  target: McpAppTabTarget;
}) {
  const repository = useRepository();
  const gone = useMcpAppLiveSetStore((state) => state.apps[target.appInstanceId]?.gone === true);
  const held = useMcpAppHeld(
    repository,
    target.sessionId,
    target.appInstanceId,
    target.dataRef,
    true,
  );
  const [shown, setShown] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  // The view's place is this tab even before it replays, so its card shows the in-tab row.
  useEffect(() => {
    if (held !== false) return;
    const entry = noteMcpApp(target, repository, 'tab');
    if (entry.placement === 'inline') {
      useMcpAppLiveSetStore.setState((state) => ({
        apps: { ...state.apps, [target.appInstanceId]: { ...entry, placement: 'tab' } },
      }));
    }
  }, [held, repository, target]);
  useEffect(() => {
    const element = frame.current;
    if (!element || shown) return;
    // A hidden tab panel is `display: none`, so it has no size until it is first shown.
    const observer = new ResizeObserver(() => {
      if (element.clientWidth > 0) setShown(true);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [shown]);
  const onReopened = useCallback(
    (view: McpAppReopenedView) => {
      const next = viewTarget(view, target.sessionId);
      next.label = target.label;
      replaceReopenedMcpApp(target.sessionId, target.appInstanceId, view);
      markMcpAppEnded(target.appInstanceId);
      noteMcpApp(next, repository, 'tab');
      const card = useMcpAppLiveSetStore.getState().apps[target.appInstanceId]?.card;
      standInForCard(view.appInstanceId, card ?? target.appInstanceId);
      onReplaceTab(`mcp-app:${target.appInstanceId}`, mcpAppTab(next));
    },
    [onReplaceTab, repository, target],
  );

  if (held === true && !gone) return <McpAppTabPanel target={target} />;
  return (
    <div className="grid h-full min-h-0 content-start p-4" ref={frame}>
      {held === undefined ? (
        <McpAppPending />
      ) : (
        <McpAppReopenLine
          appInstanceId={target.appInstanceId}
          autoReopen={shown && !gone}
          label={target.label}
          onReopened={onReopened}
          repository={repository}
          sessionId={target.sessionId}
          sourceServer={target.sourceServer}
          toolName={target.toolName}
        />
      )}
    </div>
  );
}
