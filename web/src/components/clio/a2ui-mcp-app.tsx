import type { McpAppCall, McpAppIdentity, McpAppReopenedView } from '@clio/core/v3';
import { AlertTriangleIcon, Link2Icon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RetryIcon } from '@/lib/icon-vocabulary';
import { useRepository } from '@/hooks/use-repository';
import { useA2uiReferenceSession } from '@/lib/a2ui/reference-session';
import { mcpAppLabel } from './mcp-app-live-set';
import { McpAppSurface, type McpAppSurfaceHandle } from './mcp-app-surface';
import {
  deliverServerToolResult,
  holdSurfaceApp,
  releaseSurfaceApp,
  surfaceAppTarget,
} from './mcp-app-surface-host';
import {
  acquireSurfaceOpen,
  forgetSurfaceOpen,
  type SurfaceOpenOutcome,
} from './mcp-app-surface-opens';
import {
  McpAppStateBridge,
  type ChannelCounters,
  type ChannelIssue,
  type McpAppChannel,
} from './mcp-app-state-bridge';

/** The parts of an A2UI `DataContext` the bridge reads and writes. */
export interface McpAppDataContext {
  set: (path: string, value: unknown) => void;
  subscribeDynamicValue: (
    value: never,
    onChange: (value: unknown) => void,
  ) => { unsubscribe: () => void };
}

export interface ClioMcpAppProps {
  componentId: string;
  surfaceId: string;
  server: string;
  tool: string;
  args: Record<string, unknown>;
  channels: readonly McpAppChannel[];
  height?: number;
  dataContext: McpAppDataContext;
}

interface ToolResultLike {
  isError?: boolean;
  content?: Array<{ type?: string; text?: string }>;
}

function resultError(result: unknown): string | undefined {
  const row = result as ToolResultLike | undefined;
  if (!row?.isError) return undefined;
  const text = (row.content ?? [])
    .map((block) => (block.type === 'text' ? (block.text ?? '') : ''))
    .join(' ')
    .trim();
  return text || 'The tool answered with an error.';
}

function issueText(issue: ChannelIssue): string {
  return issue.kind === 'tool_failed'
    ? `Could not change ${issue.key}: ${issue.message}`
    : `The view reported a ${issue.key} that a shared selection cannot hold.`;
}

/** An MCP App's view in an A2UI surface, opened by its call, with linked state (MA20-MA22). */
export function ClioMcpApp(props: ClioMcpAppProps) {
  const sessionId = useA2uiReferenceSession();
  const repository = useRepository();
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{ key: string; outcome: SurfaceOpenOutcome }>();
  const call = useMemo<McpAppCall>(
    () => ({ server: props.server, tool: props.tool, arguments: props.args }),
    [props.server, props.tool, props.args],
  );
  const callKey = JSON.stringify(call);
  const openKey = `${sessionId}|${props.surfaceId}|${props.componentId}|${callKey}|${attempt}`;
  const label = mcpAppLabel(props.tool, props.server);
  // A changed call or a Retry is a new open; its earlier outcome no longer applies.
  const outcome = settled?.key === openKey ? settled.outcome : undefined;

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    const held = acquireSurfaceOpen(
      openKey,
      () => repository.openMcpAppFromCall(sessionId, JSON.parse(callKey) as McpAppCall),
      (settled) => {
        if (settled.ok) releaseSurfaceApp(settled.view.appInstanceId);
      },
    );
    held.outcome.then(
      (settled) => {
        if (!active) return;
        if (settled.ok) {
          holdSurfaceApp(surfaceAppTarget(sessionId, settled.view, label), repository);
        }
        setSettled({ key: openKey, outcome: settled });
      },
      (thrown: unknown) => {
        if (!active) return;
        setSettled({
          key: openKey,
          outcome: {
            ok: false,
            reason: 'call_failed',
            detail: thrown instanceof Error ? thrown.message : String(thrown),
            savedCall: null,
            serverTools: [],
          },
        });
      },
    );
    return () => {
      active = false;
      held.release();
    };
  }, [callKey, label, openKey, repository, sessionId]);

  if (!sessionId) {
    return (
      <p className="py-3 text-sm text-destructive" role="alert">
        The {label} view cannot open outside a conversation.
      </p>
    );
  }
  if (!outcome) {
    return (
      <div
        aria-busy="true"
        className="grid gap-3 rounded-lg border p-4"
        data-mcp-app-component={props.componentId}
        style={{ minHeight: props.height ?? 320 }}
      >
        <p className="text-sm text-muted-foreground">Opening the {label} view</p>
        <Skeleton className="h-full min-h-40 w-full" />
      </div>
    );
  }
  if (!outcome.ok) {
    return (
      <Alert data-mcp-app-component={props.componentId} variant="destructive">
        <AlertTriangleIcon aria-hidden="true" />
        <AlertTitle>The {label} view could not open</AlertTitle>
        <AlertDescription className="grid gap-2">
          <span>{outcome.detail}</span>
          <span className="text-xs text-muted-foreground">
            {props.tool} on {props.server}
          </span>
          <Button
            className="justify-self-start"
            onClick={() => {
              forgetSurfaceOpen(openKey);
              setAttempt((current) => current + 1);
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <RetryIcon aria-hidden="true" />
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <OpenedMcpApp
      {...props}
      serverTools={outcome.serverTools}
      sessionId={sessionId}
      view={outcome.view}
    />
  );
}

function OpenedMcpApp(
  props: ClioMcpAppProps & { serverTools: string[]; sessionId: string; view: McpAppReopenedView },
) {
  const repository = useRepository();
  const { view, sessionId, dataContext, serverTools } = props;
  const handle = useRef<McpAppSurfaceHandle>(null);
  const bridge = useRef<McpAppStateBridge | undefined>(undefined);
  const rows = useRef(new Map<string, HTMLLIElement>());
  const [issues, setIssues] = useState<Record<string, string>>({});
  const identity = useMemo<McpAppIdentity>(
    () => ({
      sessionId,
      appInstanceId: view.appInstanceId,
      dataRef: view.dataRef,
    }),
    [view.appInstanceId, view.dataRef, sessionId],
  );
  const channelsKey = JSON.stringify(props.channels);

  useEffect(() => {
    const channels = JSON.parse(channelsKey) as McpAppChannel[];
    if (!channels.length) return;
    const current = new McpAppStateBridge({
      channels,
      componentId: props.componentId,
      write: (path, value) => dataContext.set(path, value),
      callTool: async (channel, args) => {
        const name = channel.tool ?? '';
        const frame = handle.current;
        if (!frame) throw new Error('the view is not open');
        if (serverTools.includes(name)) {
          const result = await repository.callMcpAppTool(identity, { name, arguments: args });
          const failed = resultError(result);
          if (failed) throw new Error(failed);
          deliverServerToolResult(frame, args, result);
          return;
        }
        const failed = resultError(await frame.callAppTool(name, args));
        if (failed) throw new Error(failed);
      },
      onIssue: (issue, key) =>
        setIssues((previous) => {
          const next = { ...previous };
          if (issue) next[key] = issueText(issue);
          else delete next[key];
          return next;
        }),
      onCounters: (key, counters: ChannelCounters) => {
        const row = rows.current.get(key);
        if (!row) return;
        row.dataset.reports = String(counters.reports);
        row.dataset.writes = String(counters.writes);
        row.dataset.toolCalls = String(counters.toolCalls);
        if (counters.lastWritten !== undefined) row.dataset.lastWritten = counters.lastWritten;
      },
    });
    bridge.current = current;
    const subscriptions = channels.map((channel) =>
      dataContext.subscribeDynamicValue({ path: channel.path } as never, (value) =>
        current.pathChanged(channel.path, value),
      ),
    );
    return () => {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
      current.dispose();
      if (bridge.current === current) bridge.current = undefined;
    };
  }, [channelsKey, dataContext, identity, props.componentId, repository, serverTools]);

  return (
    <div className="grid min-w-0 gap-1.5" data-mcp-app-component={props.componentId}>
      <McpAppSurface
        comments
        appInstanceId={identity.appInstanceId}
        dataRef={identity.dataRef}
        height={props.height}
        onModelContext={(context) => bridge.current?.report(context)}
        placement="surface"
        ref={handle}
        repository={repository}
        resourceUri={view.resourceUri}
        sessionId={sessionId}
        sourceServer={view.sourceServer}
        toolName={view.toolName}
      />
      {props.channels.length ? (
        <ul aria-label="State shared with this surface" className="grid gap-1 text-xs">
          {props.channels.map((channel) => (
            <li
              className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-muted-foreground"
              data-mcp-app-channel={channel.key}
              key={channel.key}
              ref={(element) => {
                if (element) rows.current.set(channel.key, element);
                else rows.current.delete(channel.key);
              }}
            >
              <Link2Icon aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="font-medium text-foreground/85">{channel.key}</span>
              <span>{channel.tool ? 'linked both ways' : 'follows the view'}</span>
              {issues[channel.key] ? (
                <span className="basis-full text-destructive" role="status">
                  {issues[channel.key]}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
