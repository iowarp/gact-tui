import type {
  Message,
  ObservedTaskChunk,
  PendingInteraction,
  TaskObservation,
  ToolInvocation,
} from '@clio/core/v3';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, CircleAlertIcon, MessageCircleQuestionIcon, TerminalIcon } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { AGENT_PROSE_CLASS } from '@/components/clio/agent-prose';
import { answerText } from '@/components/clio/flow-run-edits';
import { GroundedMessageResponse } from '@/components/clio/grounded-message-response';
import { JobCard } from '@/components/clio/job-card';
import { KeyValueGrid, type KeyValueItem } from '@/components/clio/primitives/key-value-grid';
import { runConversationHref, runKindName } from '@/components/clio/run-presentation';
import { TechnicalDetails } from '@/components/clio/technical-details';
import { ClioToolInvocation } from '@/components/clio/tool-invocation';
import { toolOperationLabel } from '@/components/clio/tool-presentation';
import { useRunChildSession } from '@/hooks/use-flow-run';
import { useRunQuestions } from '@/hooks/use-run-questions';
import { useRepository } from '@/hooks/use-repository';
import { formatDuration } from '@/lib/format';
import { jobFromTask } from '@/lib/job-snapshot';
import { formatDateTime, formatList } from '@/lib/locale-format';
import { queryKeys } from '@/lib/query-keys';
import { TRANSCRIPT_PAGE_SIZE } from '@/lib/runtime-limits';
import { cn } from '@/lib/utils';
import { useConnectionSettings } from '@/providers/connection-provider';
import { sourceLabels, type RunRow } from '@/routes/runs-rows';
import { t } from '@lingui/core/macro';

/** How often a live run's log, questions and conversation are read again. */
const RUN_POLL_MS = 3_000;
/** The tail of a delegated run's conversation shown in its run. */
const CONVERSATION_LIMIT = 40;

const LIVE: readonly RunRow['state'][] = [
  'running',
  'queued',
  'recovering',
  'stopping',
  'cancellation_requested',
  'pause_requested',
  'waiting_user',
  'waiting_permission',
];

/** A run section: the spec's `.d-res b` heading over its lines. */
function RunSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="grid min-w-0 gap-1.5 text-menu" data-slot="run-section">
      <div className="flex min-w-0 items-center gap-2">
        <h3 className="font-heading text-h3 font-semibold text-foreground">{title}</h3>
        {action ? <span className="ml-auto flex shrink-0 items-center">{action}</span> : null}
      </div>
      {children}
    </section>
  );
}

/** One `.tsk` line: an icon, the words, and a faint fact at the end. */
function RecordLine({
  icon,
  text,
  meta,
  tone,
  wrap = false,
}: {
  icon: ReactNode;
  text: ReactNode;
  meta?: string;
  tone?: 'error' | 'muted';
  /** A question is read whole, so it wraps instead of cutting off. */
  wrap?: boolean;
}) {
  return (
    <div
      className={
        tone === 'error'
          ? 'flex min-h-[30px] min-w-0 items-center gap-2.5 text-destructive-text'
          : tone === 'muted'
            ? 'flex min-h-[30px] min-w-0 items-center gap-2.5 text-muted-foreground'
            : 'flex min-h-[30px] min-w-0 items-center gap-2.5 text-foreground/90'
      }
    >
      <span
        aria-hidden="true"
        className="grid size-3.5 shrink-0 place-items-center [&_svg]:size-3.5"
      >
        {icon}
      </span>
      <span
        className={
          wrap
            ? 'min-w-0 flex-1 py-1 whitespace-pre-wrap [overflow-wrap:anywhere]'
            : 'min-w-0 flex-1 truncate'
        }
        title={!wrap && typeof text === 'string' ? text : undefined}
      >
        {text}
      </span>
      {meta ? (
        <span className="shrink-0 text-caption whitespace-nowrap text-muted-foreground tabular-nums">
          {meta}
        </span>
      ) : null}
    </div>
  );
}

/**
 * An agent's words as the transcript sets them. The record is the one scroller,
 * so a long message grows the record rather than scrolling in a box of its own.
 */
function RecordMessage({ text }: { text: string }) {
  return (
    <div
      className={cn('min-w-0 max-w-full wrap-break-word', AGENT_PROSE_CLASS)}
      data-slot="run-message"
    >
      <GroundedMessageResponse mode="static">{text}</GroundedMessageResponse>
    </div>
  );
}

/** Output text as the spec's `.term` block, wrapped in full inside the record's scroll. */
function Terminal({ text }: { text: string }) {
  return (
    <pre
      className="rounded-lg bg-muted/50 px-2.5 py-2 font-mono text-label leading-relaxed whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]"
      data-slot="run-log-output"
    >
      {text}
    </pre>
  );
}

type LogEntry =
  | { key: string; kind: 'output'; text: string }
  | { key: string; kind: 'message'; text: string }
  | { key: string; kind: 'line'; text: string }
  | { key: string; kind: 'error'; text: string };

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** What one recorded output chunk says, as log entries. */
function chunkEntries(chunk: ObservedTaskChunk, key: string, prose: boolean): LogEntry[] {
  if (chunk.error) {
    return [
      {
        key,
        kind: 'error',
        text:
          chunk.error === 'legacy_observation_history_unavailable'
            ? t`Earlier output was recorded in an older format and can't be shown.`
            : chunk.error,
      },
    ];
  }
  const output = chunk.output;
  if (output === undefined || output === null) return [];
  if (typeof output === 'string') return output ? [{ key, kind: 'output', text: output }] : [];
  const value = record(output);
  if (!value) return [{ key, kind: 'output', text: JSON.stringify(output, null, 2) }];
  const entries: LogEntry[] = [];
  if (typeof value.summary === 'string' && value.summary.trim())
    entries.push({ key: `${key}:summary`, kind: 'line', text: value.summary.trim() });
  // A turn's chunk names its tools without their arguments; a turn's calls are
  // shown from its transcript instead, so a bare list of names is not repeated here.
  const named = Array.isArray(value.tools) && value.tools.length > 0;
  // An agent's reply is prose; what a command printed stays a terminal block.
  if (prose && typeof value.text === 'string' && value.text.trim())
    entries.push({ key: `${key}:message`, kind: 'message', text: value.text.trim() });
  const text = [prose ? undefined : value.text, value.stdout, value.output, value.stderr].find(
    (part): part is string => typeof part === 'string' && Boolean(part.trim()),
  );
  if (text) entries.push({ key: `${key}:text`, kind: 'output', text });
  if (!entries.length && !named)
    entries.push({ key, kind: 'output', text: JSON.stringify(output, null, 2) });
  return entries;
}

/**
 * The log oldest first. Pages and chunks arrive newest first; a chunk too long
 * for one page is split by offset, so each chunk's parts are joined in order.
 */
function logEntries(pages: readonly TaskObservation[], prose: boolean): LogEntry[] {
  const chunks = new Map<string, ObservedTaskChunk[]>();
  for (const page of pages) {
    for (const chunk of page.tasks[0]?.output ?? []) {
      const id = chunk.chunk_id !== undefined ? String(chunk.chunk_id) : `error:${chunks.size}`;
      const parts = chunks.get(id) ?? [];
      if (!parts.some((part) => (part.offset ?? 0) === (chunk.offset ?? 0))) parts.push(chunk);
      chunks.set(id, parts);
    }
  }
  const entries: LogEntry[] = [];
  for (const [id, parts] of [...chunks.entries()].reverse()) {
    parts.sort((a, b) => (a.offset ?? 0) - (b.offset ?? 0));
    const joined =
      parts.length > 1 && parts.every((part) => typeof part.output === 'string')
        ? { ...parts[0]!, output: parts.map((part) => part.output as string).join('') }
        : parts[0]!;
    entries.push(...chunkEntries(joined, id, prose));
  }
  // Consecutive output joins into one terminal block, as a shell prints it.
  const merged: LogEntry[] = [];
  for (const entry of entries) {
    const last = merged.at(-1);
    if (entry.kind === 'output' && last?.kind === 'output') {
      merged[merged.length - 1] = {
        ...last,
        text: last.text.endsWith('\n') ? last.text + entry.text : `${last.text}\n${entry.text}`,
      };
    } else merged.push(entry);
  }
  return merged;
}

function observationError(page: TaskObservation | undefined): string | undefined {
  const error = page?.tasks[0]?.error;
  if (!error) return undefined;
  return error === 'task_unavailable' ? t`This run's log is not available to you.` : String(error);
}

type RunTranscript = { messages: Message[]; tools: ReadonlyMap<string, ToolInvocation> };

function shownMessage(message: Message, tools: ReadonlyMap<string, ToolInvocation>): boolean {
  return message.blocks.some(
    (block) =>
      (block.type === 'text' && block.text.trim()) ||
      (block.type === 'tool' && tools.has(block.tool_id)),
  );
}

/**
 * What one conversation turn did, read from its transcript: the agent's messages
 * and calls after the user message that started it (the turn's call id), up to
 * the next one. Undefined while unread, or when that message is not on the page.
 */
function useTurnTranscript(row: RunRow, live: boolean): RunTranscript | undefined {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const sessionId = row.ownerSessionId ?? row.targetSessionId ?? '';
  const anchor = row.taskKind === 'Session' ? row.task?.invocation_id : undefined;
  const transcript = useQuery({
    queryKey: queryKeys.key('run-turn', settings.endpoint, sessionId),
    enabled: Boolean(sessionId && anchor),
    queryFn: ({ signal }) =>
      repository.transcript(sessionId, signal, { limit: TRANSCRIPT_PAGE_SIZE }),
    refetchInterval: live ? RUN_POLL_MS : false,
    retry: false,
  });
  return useMemo(() => {
    const page = transcript.data;
    if (!page || !anchor) return undefined;
    const start = page.messages.findIndex((message) => message.id === anchor);
    if (start < 0) return undefined;
    const after = page.messages.slice(start + 1);
    const end = after.findIndex((message) => message.role === 'user');
    const tools = new Map(page.tools.map((tool) => [tool.id, tool]));
    return {
      messages: (end < 0 ? after : after.slice(0, end)).filter((message) =>
        shownMessage(message, tools),
      ),
      tools,
    };
  }, [transcript.data, anchor]);
}

function speaker(message: Message): string {
  if (message.role === 'user') return t`Instructions`;
  if (message.role === 'assistant') return t`Agent`;
  return t`System`;
}

/**
 * Messages as the transcript shows them: words as prose and each call as the
 * transcript's own row (its icon, action and key arguments), in the order made.
 */
function RunMessages({
  transcript,
  sessionId,
  speakers = false,
}: {
  transcript: RunTranscript;
  sessionId: string;
  /** A held conversation names who spoke; one turn is all the agent's. */
  speakers?: boolean;
}) {
  return (
    <ol className="grid min-w-0 gap-3" data-slot="run-messages">
      {transcript.messages.map((message) => (
        <li className="grid min-w-0 gap-1" key={message.id}>
          {speakers ? (
            <div className="flex min-w-0 items-baseline gap-2 text-menu">
              <span className="font-medium text-foreground">{speaker(message)}</span>
              <span className="text-caption text-muted-foreground tabular-nums">
                {formatDateTime(message.created_at)}
              </span>
            </div>
          ) : null}
          {message.blocks.map((block) => {
            if (block.type === 'text')
              return block.text.trim() ? <RecordMessage key={block.id} text={block.text} /> : null;
            if (block.type !== 'tool') return null;
            const tool = transcript.tools.get(block.tool_id);
            return tool ? (
              <ClioToolInvocation compact key={block.id} sessionId={sessionId} tool={tool} />
            ) : null;
          })}
        </li>
      ))}
    </ol>
  );
}

/** Everything the run recorded, read newest first and shown oldest first; older pages on request. */
function RunLog({ row, live }: { row: RunRow; live: boolean }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const sessionId = row.ownerSessionId ?? row.targetSessionId ?? '';
  const log = useInfiniteQuery({
    queryKey: queryKeys.key('run-log', settings.endpoint, sessionId, row.handleId),
    enabled: Boolean(sessionId),
    initialPageParam: '',
    queryFn: ({ pageParam, signal }) =>
      repository.observeTasks(
        sessionId,
        [row.handleId],
        { cursor: pageParam || undefined },
        signal,
      ),
    getNextPageParam: (page) =>
      page.tasks[0]?.output_truncated && page.cursor ? page.cursor : undefined,
    refetchInterval: live ? RUN_POLL_MS : false,
    retry: false,
  });
  const prose = row.taskKind === 'Subagent' || row.taskKind === 'Session';
  const entries = useMemo(() => logEntries(log.data?.pages ?? [], prose), [log.data, prose]);
  const turn = useTurnTranscript(row, live);
  const denied = observationError(log.data?.pages[0]);
  const progress =
    typeof row.progress?.message === 'string' ? row.progress.message.trim() : undefined;
  return (
    <RunSection
      action={
        log.hasNextPage ? (
          <Button
            disabled={log.isFetchingNextPage}
            onClick={() => void log.fetchNextPage()}
            size="compact"
            variant="ghost"
          >
            {log.isFetchingNextPage ? t`Loading earlier output` : t`Show earlier output`}
          </Button>
        ) : undefined
      }
      title={t`Log`}
    >
      {turn?.messages.length ? (
        <RunMessages sessionId={sessionId} transcript={turn} />
      ) : log.isPending && sessionId ? (
        <RecordLine icon={<TerminalIcon />} text={t`Reading the log`} tone="muted" />
      ) : log.isError ? (
        <RecordLine
          icon={<CircleAlertIcon />}
          text={t`The log could not be read: ${log.error.message}`}
          tone="error"
        />
      ) : denied ? (
        <RecordLine icon={<CircleAlertIcon />} text={denied} tone="muted" />
      ) : entries.length ? (
        <div className="grid min-w-0 gap-1.5" data-slot="run-log">
          {entries.map((entry) =>
            entry.kind === 'output' ? (
              <Terminal key={entry.key} text={entry.text} />
            ) : entry.kind === 'message' ? (
              <RecordMessage key={entry.key} text={entry.text} />
            ) : entry.kind === 'error' ? (
              <RecordLine
                icon={<CircleAlertIcon />}
                key={entry.key}
                text={entry.text}
                tone="error"
              />
            ) : (
              <RecordLine icon={<CheckIcon />} key={entry.key} text={entry.text} />
            ),
          )}
        </div>
      ) : (
        <RecordLine
          icon={<TerminalIcon />}
          text={progress && live ? progress : t`No output recorded`}
          tone="muted"
        />
      )}
    </RunSection>
  );
}

function questionState(question: PendingInteraction): string {
  switch (question.status) {
    case 'pending':
      return t`waiting for you`;
    case 'answered':
      return question.answered_by === 'agent' ? t`answered by the agent` : t`answered`;
    case 'denied':
      return t`denied`;
    case 'cancelled':
      return t`cancelled`;
    case 'expired':
      return t`expired`;
    default:
      return String(question.status);
  }
}

/**
 * A permission the approval mode, a hook or an access rule settled without
 * asking anyone ("shell command 'shell_bash' allowed by approval posture=…").
 * A click on a plugin page is the person's own decision and stays a question.
 */
const AUTOMATIC_DECISION = /^[\w -]+? (['"])(.+?)\1 (allowed|blocked|covered) by (?!a click)/iu;

function automaticDecision(
  question: PendingInteraction,
): { tool: string; allowed: boolean } | undefined {
  if (question.kind !== 'permission' || question.status === 'pending') return undefined;
  const match = AUTOMATIC_DECISION.exec(question.title.trim());
  if (!match) return undefined;
  return {
    tool: question.source.tool_name || match[2]!,
    allowed: match[3]!.toLowerCase() !== 'blocked',
  };
}

/**
 * The questions this run asked, oldest first, apart from the permissions its
 * approval mode settled on its own: those were never put to anyone.
 */
function useRunInteractions(row: RunRow, live: boolean) {
  const mine = useRunQuestions(row, live);
  return useMemo(() => {
    const allowed = new Set<string>();
    const blocked = new Set<string>();
    const asked: PendingInteraction[] = [];
    for (const question of mine) {
      const decision = automaticDecision(question);
      if (!decision) asked.push(question);
      else (decision.allowed ? allowed : blocked).add(toolOperationLabel(decision.tool));
    }
    return { asked, allowed: [...allowed], blocked: [...blocked] };
  }, [mine]);
}

/** The questions this run asked and how each was answered, oldest first. */
function RunQuestions({ row, live }: { row: RunRow; live: boolean }) {
  const { asked } = useRunInteractions(row, live);
  if (!asked.length) return null;
  const answerHref = runConversationHref(row, false);
  return (
    <RunSection title={t`Questions`}>
      <ul className="grid min-w-0 gap-2" data-slot="run-questions">
        {asked.map((question) => {
          const answer = question.status === 'answered' ? answerText(question) : '';
          return (
            <li className="grid min-w-0" key={question.id}>
              <RecordLine
                icon={<MessageCircleQuestionIcon />}
                meta={questionState(question)}
                text={question.prompt?.trim() || question.title}
                wrap
              />
              <p className="ml-6 min-w-0 text-meta whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">
                {answer
                  ? t`Answer: ${answer}`
                  : question.status === 'pending'
                    ? t`Asked ${formatDateTime(question.created_at)}`
                    : t`No answer recorded`}
              </p>
              {question.status === 'pending' && answerHref && row.state !== 'waiting_user' ? (
                <Button
                  asChild
                  className="mt-1 ml-6 justify-self-start"
                  size="compact"
                  variant="outline"
                >
                  <Link to={answerHref}>{t`Answer`}</Link>
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </RunSection>
  );
}

/** The conversation a delegated run held: its newest messages, the full one a link away. */
function RunConversation({ row, live }: { row: RunRow; live: boolean }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const lookup = useRunChildSession(row.handleId, row.taskKind === 'Subagent', live);
  const child = lookup.child;
  const conversation = useQuery({
    queryKey: queryKeys.key('run-conversation', settings.endpoint, child),
    enabled: Boolean(child),
    queryFn: ({ signal }) => repository.transcript(child, signal, { limit: CONVERSATION_LIMIT }),
    refetchInterval: live ? RUN_POLL_MS : false,
    retry: false,
  });
  const transcript = useMemo<RunTranscript | undefined>(() => {
    const page = conversation.data;
    if (!page) return undefined;
    const tools = new Map(page.tools.map((tool) => [tool.id, tool]));
    return { messages: page.messages.filter((message) => shownMessage(message, tools)), tools };
  }, [conversation.data]);
  if (row.taskKind !== 'Subagent') return null;
  const href =
    child && row.workspaceId
      ? `/workspaces/${encodeURIComponent(row.workspaceId)}/sessions/${encodeURIComponent(child)}`
      : undefined;
  return (
    <RunSection
      action={
        href ? (
          <Button asChild size="compact" variant="ghost">
            <Link to={href}>{t`Open conversation`}</Link>
          </Button>
        ) : undefined
      }
      title={t`Conversation`}
    >
      {lookup.failed ? (
        <RecordLine
          icon={<CircleAlertIcon />}
          text={t`The conversation could not be found.`}
          tone="error"
        />
      ) : !child && !lookup.pending ? (
        <RecordLine
          icon={<TerminalIcon />}
          text={live ? t`The conversation starts when the run does.` : t`No conversation recorded`}
          tone="muted"
        />
      ) : !child || conversation.isPending ? (
        <RecordLine icon={<TerminalIcon />} text={t`Reading the conversation`} tone="muted" />
      ) : conversation.isError ? (
        <RecordLine
          icon={<CircleAlertIcon />}
          text={t`The conversation could not be read: ${conversation.error.message}`}
          tone="error"
        />
      ) : transcript?.messages.length ? (
        <div className="grid min-w-0 gap-3" data-slot="run-conversation">
          {conversation.data?.next_cursor ? (
            <p className="text-meta text-muted-foreground">{t`Earlier messages are in the conversation.`}</p>
          ) : null}
          <RunMessages sessionId={child} speakers transcript={transcript} />
        </div>
      ) : (
        <RecordLine icon={<TerminalIcon />} text={t`No messages yet`} tone="muted" />
      )}
    </RunSection>
  );
}
function when(iso: string | undefined): string | undefined {
  return iso && !Number.isNaN(Date.parse(iso)) ? formatDateTime(iso) : undefined;
}

/** What ran where and when, in words; backend ids stay under Technical details. */
function RunDetails({ row, live }: { row: RunRow; live: boolean }) {
  const { allowed, blocked } = useRunInteractions(row, live);
  const started = row.createdAt ? Date.parse(row.createdAt) : Number.NaN;
  const ended = row.terminalAt ? Date.parse(row.terminalAt) : Number.NaN;
  const took =
    !Number.isNaN(started) && !Number.isNaN(ended) && ended >= started
      ? formatDuration(ended - started)
      : undefined;
  const ranOn = row.source === 'flow' ? row.placement : row.host;
  // The agent's own backend ("clio") is not a place; Workspace already says where.
  const place = ranOn && ranOn !== 'clio' ? ranOn : row.source === 'flow' ? '' : undefined;
  const tool = row.task?.tool ? toolOperationLabel(row.task.tool) : '';
  const facts: KeyValueItem[] = [
    { label: t`Kind`, value: row.taskKind ? runKindName(row.taskKind) : sourceLabels[row.source] },
    ...(place === undefined
      ? []
      : [
          {
            label: row.source === 'flow' ? t`Placement` : t`Ran on`,
            value: place || t`This computer`,
          },
        ]),
    { label: t`Workspace`, value: row.workspaceLabel },
    ...(when(row.createdAt) ? [{ label: t`Started`, value: when(row.createdAt)! }] : []),
    ...(when(row.terminalAt)
      ? [{ label: t`Ended`, value: when(row.terminalAt)! }]
      : [{ label: t`Updated`, value: when(row.updatedAt) ?? t`Time unavailable` }]),
    ...(took ? [{ label: t`Took`, value: took }] : []),
    // A tool without a declared name stays under Technical details.
    ...(tool && tool !== row.task?.tool ? [{ label: t`Tool`, value: tool }] : []),
    ...(allowed.length
      ? [{ label: t`Allowed automatically`, value: formatList(allowed, { and: true }) }]
      : []),
    ...(blocked.length
      ? [{ label: t`Blocked automatically`, value: formatList(blocked, { and: true }) }]
      : []),
  ];
  const backend = row.task?.backend;
  const ids: KeyValueItem[] = [
    { label: t`Backend status`, value: row.reportedStatus, mono: true },
    { label: t`Task`, value: row.taskId, mono: true },
    ...(row.handleId !== row.taskId ? [{ label: t`Handle`, value: row.handleId, mono: true }] : []),
    ...(backend?.task_id ? [{ label: t`Backend task`, value: backend.task_id, mono: true }] : []),
    ...(backend?.server ? [{ label: t`Server`, value: backend.server, mono: true }] : []),
    ...(backend?.queue ? [{ label: t`Queue`, value: backend.queue, mono: true }] : []),
    ...(row.task?.tool ? [{ label: t`Tool id`, value: row.task.tool, mono: true }] : []),
    ...(row.task?.invocation_id
      ? [{ label: t`Call`, value: row.task.invocation_id, mono: true }]
      : []),
  ];
  return (
    <RunSection title={t`Details`}>
      {row.assignment ? (
        <p className="mb-1 min-w-0 whitespace-pre-wrap text-foreground/90 [overflow-wrap:anywhere]">
          {row.assignment}
        </p>
      ) : null}
      {row.statusDetail ? (
        <p className="mb-1 min-w-0 whitespace-pre-wrap text-destructive-text [overflow-wrap:anywhere]">
          {t`Reported issue: ${row.statusDetail}`}
        </p>
      ) : null}
      <div className="@container min-w-0">
        <KeyValueGrid items={facts} variant="facts" />
      </div>
      <TechnicalDetails className="mt-1 text-meta" title={t`Technical details`}>
        <div className="@container mt-1 min-w-0">
          <KeyValueGrid items={ids} variant="facts" />
        </div>
      </TechnicalDetails>
    </RunSection>
  );
}

/**
 * Retry for a failed run its server can start again. Running in the context box
 * lists only live runs, so a failed run is retried from its record.
 */
export function RunRetry({ row }: { row: RunRow }) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const sessionId = row.ownerSessionId ?? row.targetSessionId ?? '';
  const retry = useMutation({
    mutationFn: () => repository.controlSubagent(sessionId, row.handleId, 'restart'),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.key('tasks', settings.endpoint) }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('run-snapshot', settings.endpoint),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.sessionObservability(settings.endpoint, sessionId),
        }),
      ]);
    },
    onError: (error) => toast.error(t`Could not retry ${row.label}: ${error.message}`),
  });
  if (row.state !== 'failed' || !sessionId || !row.task?.supported_actions.includes('restart'))
    return null;
  return (
    <Button
      className="mt-1 ml-6 justify-self-start"
      disabled={retry.isPending}
      onClick={() => retry.mutate()}
      size="compact"
      variant="outline"
    >
      {retry.isPending ? t`Retrying` : t`Retry`}
    </Button>
  );
}

/**
 * What a run did, below its state line: the scheduler job it holds, its log
 * (steps, output and errors as recorded), the questions it asked with their
 * answers, a delegated run's conversation, and where and when it ran.
 */
export function RunRecord({ row }: { row: RunRow }) {
  const live = LIVE.includes(row.state);
  const job = row.task ? jobFromTask(row.task) : null;
  // A delegated run's conversation already holds its steps and summary; one place shows them.
  const delegated = row.taskKind === 'Subagent';
  const { child } = useRunChildSession(row.handleId, delegated, live);
  return (
    <div className="grid min-w-0 gap-5" data-slot="run-record">
      {job ? (
        <RunSection title={t`Job`}>
          <JobCard job={job} />
        </RunSection>
      ) : null}
      {delegated && child ? null : <RunLog live={live} row={row} />}
      <RunQuestions live={live} row={row} />
      <RunConversation live={live} row={row} />
      <RunDetails live={live} row={row} />
    </div>
  );
}
