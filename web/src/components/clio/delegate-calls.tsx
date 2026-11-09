import type { SubagentRun, ToolInvocation } from '@clio/core/v3';
import { useContext, useEffect, useMemo, useState } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { TRANSCRIPT_PAGE_SIZE } from '@/lib/runtime-limits';
import { useTranscriptPreviewLines } from '@/providers/appearance-provider';
import { ActivityNest } from './activity-row';
import { BoundedResult } from './bounded-result';
import { delegateTone } from './delegate-tone';
import { GroundedMessageResponse } from './grounded-message-response';
import { PresentationNavigation } from './presentation-navigation';
import { StateView } from './primitives/state-view';
import { ClioToolInvocation } from './tool-invocation';

/** How many of a delegate's calls show before "Show all". */
const SHOWN = 6;
/** How often a running child's calls are read again while its delegate is open. */
const REFRESH_MS = 5_000;

/** The child's own calls, in order; a script's calls stay under their script. */
function topLevelCalls(tools: readonly ToolInvocation[], sessionId: string): ToolInvocation[] {
  const ids = new Set(tools.map((tool) => tool.id));
  return tools
    .filter(
      (tool) =>
        tool.session_id === sessionId && !(tool.parent_call_id && ids.has(tool.parent_call_id)),
    )
    .sort((a, b) => (a.started_at ?? '').localeCompare(b.started_at ?? ''));
}

type ChildCalls = { calls: ToolInvocation[]; pending: boolean; error?: string; retry: () => void };

/**
 * The calls on the child's newest transcript page, read when its delegate opens
 * and again every few seconds while the child runs.
 */
function useChildCalls(childId: string | undefined, running: boolean): ChildCalls {
  const repository = useRepository();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; calls: ToolInvocation[]; error?: string }>({
    key: '',
    calls: [],
  });
  const key = `${childId ?? ''}:${attempt}`;
  useEffect(() => {
    if (!childId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = () => {
      repository
        .transcript(childId, controller.signal, { limit: TRANSCRIPT_PAGE_SIZE })
        .then((page) => {
          if (controller.signal.aborted) return;
          setState({ key, calls: topLevelCalls(page.tools, childId) });
          if (running) timer = setTimeout(read, REFRESH_MS);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setState((previous) => ({
            key,
            calls: previous.calls,
            error: error instanceof Error ? error.message : 'Unable to read its calls.',
          }));
        });
    };
    read();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [repository, childId, running, key]);
  return {
    calls: state.calls,
    pending: Boolean(childId) && state.key !== key,
    error: state.key === key ? state.error : undefined,
    retry: () => setAttempt((value) => value + 1),
  };
}

/**
 * An opened delegate: the calls its agent made, one step in as 28px rows, then
 * what it returned. With no calls, one quiet line says so.
 */
export function DelegateCalls({
  subagent,
  name,
  result,
}: {
  subagent?: SubagentRun;
  name: string;
  result?: string;
}) {
  const childId = subagent?.child_session_id;
  const provided = useContext(PresentationNavigation)?.tools;
  const offline = useMemo(
    () => (provided && childId ? topLevelCalls(Object.values(provided), childId) : []),
    [provided, childId],
  );
  const running = subagent ? delegateTone(subagent.state) === 'running' : false;
  const fetched = useChildCalls(offline.length ? undefined : childId, running);
  const calls = offline.length ? offline : fetched.calls;
  const [all, setAll] = useState(false);
  const lines = useTranscriptPreviewLines();
  const shown = all ? calls : calls.slice(0, SHOWN);
  return (
    <ActivityNest
      label={`Calls by ${name}`}
      hidden={calls.length - shown.length}
      onShowAll={() => setAll(true)}
      showAllLabel={`Show all ${calls.length}`}
    >
      {shown.map((tool) => (
        <ClioToolInvocation compact key={tool.id} sessionId={childId} tool={tool} />
      ))}
      {calls.length ? null : fetched.pending ? (
        <StateView kind="loading" size="row" title="Loading its calls…" />
      ) : fetched.error ? (
        <StateView
          action={{ label: 'Retry', onClick: fetched.retry }}
          className="w-fit max-w-full"
          kind="error"
          size="row"
          title="Its calls could not be loaded"
        />
      ) : (
        <StateView kind="empty" size="row" title={running ? 'No calls yet' : 'No calls recorded'} />
      )}
      {result ? (
        <div className="py-1 pl-2 text-[13px]" data-slot="delegate-result">
          <BoundedResult lines={lines} title={`${name} returned`}>
            <GroundedMessageResponse mode="static">{result}</GroundedMessageResponse>
          </BoundedResult>
        </div>
      ) : null}
    </ActivityNest>
  );
}
