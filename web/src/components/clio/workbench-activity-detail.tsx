import type { AsyncProcess, PendingInteraction, SubagentRun, ToolInvocation } from '@clio/core/v3';
import { BookOpenIcon, CheckIcon, CircleStopIcon, CircleXIcon, CopyIcon } from 'lucide-react';
import { memo, useState, type ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useNow } from '@/hooks/use-now';
import { vocab } from '@/lib/brand-vocabulary';
import { formatDuration } from '@/lib/format';
import { AsyncTaskList } from './async-task-list';
import { EvidenceRecord } from './observability-evidence-record';
import { OpenQuestionList } from './open-question-list';
import { FrameBar, FrameCrumbs } from './primitives/frame-bar';
import { IconButton } from './primitives/icon-button';
import { KeyValueGrid, type KeyValueItem } from './primitives/key-value-grid';
import { ListRow } from './primitives/list-row';
import { StateView } from './primitives/state-view';
import { StatusIndicator } from './primitives/status-indicator';
import { MetaValue } from './primitives/tag';
import type { SubagentOpenTarget } from './subagent-card';
import { copyTextToClipboard } from './surface-export';
import { taskProgressLabel } from './task-progress-label';
import { ActivityKindIcon } from './workbench-activity-icon';
import { activityTab } from './workbench-activity-tab';
import { compactDuration, toolActivityItem, type ActivityItem } from './workbench-activity-model';
import {
  useActivityItems,
  useWorkbenchActivitySource,
  type WorkbenchActivitySource,
} from './workbench-activity-source';
import { tabForOpenRequest } from './workbench-open-request';
import type { WorkbenchTab } from './workbench-shared';

type ActivityTab = Extract<WorkbenchTab, { kind: 'activity' }>;

interface DetailProps {
  tab: ActivityTab;
  onOpenTab: (tab: WorkbenchTab) => void;
  onOpenSubagent: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
}

/** Long outputs stay readable; Copy takes the whole text. */
const SHOWN_CHARACTERS = 20_000;
const BROWSER_PANEL = 'mx-auto grid w-full max-w-4xl content-start gap-4 p-4';

/** One Activity row opened as a tab: what ran, with what, what came back and who ran it. */
export function WorkbenchActivityDetail(props: DetailProps) {
  const source = useWorkbenchActivitySource();
  if (!source || source.sessionId !== props.tab.sessionId)
    return (
      <DetailFrame name={props.tab.label}>
        <StateView
          className="p-6"
          detail="Open the conversation it belongs to."
          kind="unavailable"
          size="panel"
          title="This activity is not loaded"
        />
      </DetailFrame>
    );
  return <LoadedDetail {...props} source={source} />;
}

function LoadedDetail({ source, ...props }: DetailProps & { source: WorkbenchActivitySource }) {
  const { itemId } = props.tab;
  const items = useActivityItems(source, { sources: itemId.startsWith('source:') });
  // A tool of an earlier turn folds into that turn's row; its tab still shows it.
  const tool = itemId.startsWith('tool:')
    ? source.tools.find((entry) => `tool:${entry.id}` === itemId)
    : undefined;
  const item = items.find((entry) => entry.id === itemId) ?? (tool && toolActivityItem(tool));
  if (!item)
    return (
      <DetailFrame name={props.tab.label}>
        <StateView
          className="p-6"
          detail="It finished in an earlier conversation load or was removed."
          kind="empty"
          size="panel"
          title="This activity is no longer available"
        />
      </DetailFrame>
    );
  return <ActivityDetailView {...props} item={item} source={source} />;
}

function DetailFrame({
  name,
  what,
  actions,
  children,
}: {
  name: string;
  what?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <FrameBar
        actions={actions}
        label="Activity actions"
        what={what}
        where={<FrameCrumbs parts={[{ label: 'Activity' }, { label: name }]} />}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

function startedAt(item: ActivityItem): string | undefined {
  return item.tool?.started_at ?? item.process?.created_at ?? item.run?.started_at ?? item.at;
}

/** How long it has run, or ran: "2 min 14 s". */
function elapsed(item: ActivityItem, now: number): string | undefined {
  const known = item.tool?.duration_ms ?? item.subagent?.duration_ms ?? item.run?.elapsed_ms;
  if (known !== undefined && !item.running) return formatDuration(known);
  const start = startedAt(item);
  if (!start) return undefined;
  const end = item.running
    ? now
    : Date.parse(
        item.tool?.completed_at ?? item.run?.completed_at ?? item.process?.updated_at ?? '',
      );
  const span = end - Date.parse(start);
  return Number.isFinite(span) && span >= 0 ? formatDuration(span) : undefined;
}

function json(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2) ?? '';
  } catch {
    return String(value);
  }
}

function copyText(item: ActivityItem): string {
  if (item.tool)
    return json({
      name: item.tool.name,
      input: item.tool.input,
      output: item.tool.output_stream ?? item.tool.output,
      error: item.tool.error,
    });
  if (item.steps)
    return item.steps.map((step) => `${step.name} ${step.duration_ms ?? ''}`.trim()).join('\n');
  const result = item.process?.result?.answer ?? item.subagent?.result;
  return [item.name, item.status, result].filter(Boolean).join('\n');
}

const ActivityDetailView = memo(function ActivityDetailView({
  item,
  source,
  tab,
  onOpenTab,
  onOpenSubagent,
}: DetailProps & { item: ActivityItem; source: WorkbenchActivitySource }) {
  const now = useNow(item.running);
  const time = elapsed(item, now);
  const [copied, setCopied] = useState(false);
  const [stopping, setStopping] = useState(false);
  const process = item.process;
  const stoppable = Boolean(
    process &&
      item.running &&
      source.onCancelTask &&
      process.supported_actions?.includes('cancel') &&
      !process.cancel_requested,
  );
  const fact = item.running
    ? `running${time ? ` ${time}` : ''}`
    : time && !item.status.includes(time)
      ? `${item.status}, ${time}`
      : item.status;
  return (
    <DetailFrame
      actions={
        <>
          {stoppable ? (
            <IconButton
              icon={<CircleStopIcon />}
              label="Stop"
              onClick={() => setStopping(true)}
              size="sm"
            />
          ) : null}
          <IconButton
            icon={copied ? <CheckIcon /> : <CopyIcon />}
            label={copied ? 'Copied' : 'Copy'}
            onClick={() => void copyTextToClipboard(copyText(item)).then(setCopied)}
            size="sm"
          />
        </>
      }
      name={tab.label}
      what={<span>{fact}</span>}
    >
      <div className={BROWSER_PANEL}>
        <div className="flex min-w-0 items-center gap-2">
          {item.running ? (
            <StatusIndicator display="column" label="Running" tone="running" />
          ) : (
            <ActivityKindIcon className="size-4 shrink-0 text-muted-foreground" kind={item.kind} />
          )}
          <h2 className="min-w-0 truncate text-[15px] font-semibold" title={item.name}>
            {item.name}
          </h2>
          <span className="shrink-0 text-[12px] text-muted-foreground">{fact}</span>
        </div>
        <DetailBody
          item={item}
          onOpenSubagent={onOpenSubagent}
          onOpenTab={onOpenTab}
          source={source}
          tab={tab}
        />
      </div>
      {process ? (
        <StopDialog
          onConfirm={() => source.onCancelTask?.(process)}
          onOpenChange={setStopping}
          open={stopping}
          process={process}
        />
      ) : null}
    </DetailFrame>
  );
});

function StopDialog({
  process,
  open,
  onOpenChange,
  onConfirm,
}: {
  process: AsyncProcess;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void> | undefined;
}) {
  const [error, setError] = useState('');
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Stop {process.title}?</AlertDialogTitle>
          <AlertDialogDescription>
            {process.kind === 'agent'
              ? 'This also stops all descendant agents, downloads and shell processes.'
              : 'Cancellation is requested from its owner and may take time to finish.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Keep running</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setError('');
              void onConfirm()?.catch((reason: unknown) =>
                setError(reason instanceof Error ? reason.message : String(reason)),
              );
            }}
          >
            Stop
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="grid min-w-0 gap-1.5">
      <div className="flex h-6 min-w-0 items-center gap-2">
        <h3 className="text-[12px] font-semibold text-muted-foreground">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Mono({ text, label }: { text: string; label: string }) {
  const shown = text.length > SHOWN_CHARACTERS ? text.slice(0, SHOWN_CHARACTERS) : text;
  return (
    <>
      <pre
        aria-label={label}
        className="max-h-[50vh] min-w-0 overflow-auto rounded-md border border-border bg-muted/40 p-2.5 font-mono text-[12px] leading-5 whitespace-pre"
        tabIndex={0}
      >
        {shown}
      </pre>
      {shown !== text ? (
        <p className="text-[12px] text-muted-foreground">
          Showing the first {SHOWN_CHARACTERS.toLocaleString()} of {text.length.toLocaleString()}{' '}
          characters. Copy takes all of it.
        </p>
      ) : null}
    </>
  );
}

function DetailBody({
  item,
  source,
  tab,
  onOpenTab,
  onOpenSubagent,
}: DetailProps & { item: ActivityItem; source: WorkbenchActivitySource }) {
  if (item.tool)
    return (
      <ToolDetail interactions={source.interactions} tool={item.tool} running={item.running} />
    );
  if (item.steps && item.run)
    return (
      <TurnDetail item={item} onOpenTab={onOpenTab} source={source} workspaceId={tab.workspaceId} />
    );
  if (item.process || item.subagent)
    return <TaskDetail item={item} onOpenSubagent={onOpenSubagent} source={source} />;
  if (item.interaction)
    return <InteractionDetail interaction={item.interaction} pending={item.group === 'now'} />;
  if (item.source) {
    const { resource, artifact } = item.source;
    return (
      <div className="grid gap-3">
        <EvidenceRecord
          detail={item.source.detailParts?.map((part) => part.text).join(', ') ?? item.source.value}
          icon={BookOpenIcon}
          label={item.source.label}
          state="completed"
        />
        <KeyValueGrid
          items={[
            ...(item.source.relation
              ? [{ label: 'Used as', value: item.source.relation.replaceAll('_', ' ') }]
              : []),
            ...(item.source.ownerLabel
              ? [{ label: 'Used by', value: item.source.ownerLabel }]
              : []),
            ...(item.source.link && item.source.value
              ? [
                  {
                    label: 'Link',
                    value: (
                      <a
                        className="underline"
                        href={item.source.value}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {item.source.value}
                      </a>
                    ),
                  },
                ]
              : []),
          ]}
        />
        {resource || artifact ? (
          <div>
            <Button
              onClick={() =>
                onOpenTab(
                  tabForOpenRequest(
                    resource
                      ? { kind: 'resource', resource }
                      : { kind: 'artifact', artifact: artifact! },
                    source.sessionId,
                    resource?.workspace_id ?? artifact?.workspace_id ?? '',
                  ),
                )
              }
              size="sm"
              variant="outline"
            >
              Open {resource ? resource.name : 'artifact'}
            </Button>
          </div>
        ) : null}
      </div>
    );
  }
  if (item.task)
    return (
      <KeyValueGrid
        items={[
          { label: 'State', value: item.status },
          ...(item.task.detail ? [{ label: 'Detail', value: item.task.detail }] : []),
        ]}
      />
    );
  return <KeyValueGrid items={[{ label: 'State', value: item.status }]} />;
}

function ToolDetail({
  tool,
  running,
  interactions,
}: {
  tool: ToolInvocation;
  running: boolean;
  interactions: readonly PendingInteraction[];
}) {
  const output = tool.output_stream ?? (tool.output === undefined ? '' : json(tool.output));
  const approval = interactions.find(
    (interaction) =>
      interaction.kind === 'permission' && interaction.source.invocation_id === tool.id,
  );
  const ranBy: KeyValueItem[] = [
    {
      label: 'Who',
      value: tool.parent_call_id ? `A script (call ${tool.parent_call_id})` : vocab.agent,
    },
    {
      label: 'Policy',
      value: approval
        ? `Asked for approval, ${approval.status.replaceAll('_', ' ')}`
        : 'Ran without asking',
    },
    { label: 'Tool', value: tool.name, mono: true },
  ];
  return (
    <>
      <Section title="Input">
        {tool.input === undefined ? (
          <p className="text-[12.5px] text-muted-foreground">No input</p>
        ) : (
          <Mono label="Input" text={json(tool.input)} />
        )}
      </Section>
      <Section
        aside={running ? <StatusIndicator label="streaming" tone="running" /> : undefined}
        title="Output"
      >
        {tool.progress_message && running ? (
          <p className="text-[12.5px] text-muted-foreground">{tool.progress_message}</p>
        ) : null}
        {output ? (
          <Mono label="Output" text={output} />
        ) : (
          <p className="text-[12.5px] text-muted-foreground">
            {running ? 'Waiting for output' : 'No output'}
          </p>
        )}
        {tool.error ? (
          <p className="text-[12.5px] text-destructive" role="alert">
            Failed: {tool.error}
          </p>
        ) : null}
      </Section>
      <Section title="Ran by">
        <KeyValueGrid items={ranBy} />
      </Section>
    </>
  );
}

function TurnDetail({
  item,
  source,
  workspaceId,
  onOpenTab,
}: {
  item: ActivityItem;
  source: WorkbenchActivitySource;
  workspaceId: string;
  onOpenTab: (tab: WorkbenchTab) => void;
}) {
  const steps = item.steps ?? [];
  return (
    <>
      {item.run?.summary ? <p className="text-[13px]">{item.run.summary}</p> : null}
      <Section title={`Steps (${steps.length})`}>
        <div aria-label="Steps" className="grid" role="list">
          {steps.map((step) => {
            const row = toolActivityItem(step);
            const open = () => onOpenTab(activityTab(row, source.sessionId, workspaceId));
            return (
              <div key={step.id} role="listitem">
                <ListRow
                  aria-label={`${row.name}, ${row.status}`}
                  className="cursor-pointer text-[12.5px]"
                  columns={<MetaValue width={64}>{row.trailing}</MetaValue>}
                  onClick={open}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    open();
                  }}
                  role="button"
                  status={
                    row.running ? (
                      <StatusIndicator display="column" label="Running" tone="running" />
                    ) : row.failed ? (
                      <CircleXIcon
                        aria-label="Failed"
                        className="size-3.5 text-destructive"
                        role="img"
                      />
                    ) : (
                      <CheckIcon aria-label="Done" className="size-3.5 text-success" role="img" />
                    )
                  }
                  tabIndex={0}
                  title={row.name}
                />
              </div>
            );
          })}
        </div>
      </Section>
    </>
  );
}

function TaskDetail({
  item,
  source,
  onOpenSubagent,
}: {
  item: ActivityItem;
  source: WorkbenchActivitySource;
  onOpenSubagent: DetailProps['onOpenSubagent'];
}) {
  const { process, subagent } = item;
  const facts: KeyValueItem[] = [
    { label: 'State', value: item.status },
    ...(process?.task_kind ? [{ label: 'Kind', value: process.task_kind }] : []),
    ...(process?.host ? [{ label: 'Host', value: process.host, mono: true }] : []),
    ...(process?.progress
      ? [
          {
            label: 'Progress',
            value:
              taskProgressLabel(process.progress, process.task_kind, process.error_reason) || '',
          },
        ]
      : []),
    ...(item.tool?.duration_ms
      ? [{ label: 'Took', value: compactDuration(item.tool.duration_ms) }]
      : []),
  ].filter((fact) => fact.value !== '');
  const log = [process?.activity, process?.error_reason].filter(Boolean).join('\n');
  const result = process?.result?.answer ?? process?.result?.answer_excerpt ?? subagent?.result;
  return (
    <>
      {process?.description || subagent?.task ? (
        <p className="text-[13px] whitespace-pre-wrap">{process?.description ?? subagent?.task}</p>
      ) : null}
      <KeyValueGrid items={facts} />
      {log ? (
        <Section title="Log">
          <Mono label="Log" text={log} />
        </Section>
      ) : null}
      {result ? (
        <Section title="Result">
          <Mono label="Result" text={result} />
        </Section>
      ) : null}
      <Section title="Controls">
        <AsyncTaskList
          compact
          onControlTask={source.onControlTask}
          onOpenFlow={source.onOpenFlow}
          onOpenSubagent={onOpenSubagent}
          processes={process ? [process] : []}
          subagents={subagent ? [subagent] : []}
        />
      </Section>
    </>
  );
}

function InteractionDetail({
  interaction,
  pending,
}: {
  interaction: PendingInteraction;
  pending: boolean;
}) {
  const question = interaction.kind === 'question';
  return (
    <>
      {interaction.prompt ? (
        <p className="text-[13px] whitespace-pre-wrap">{interaction.prompt}</p>
      ) : null}
      <KeyValueGrid
        items={[
          { label: 'State', value: interaction.status.replaceAll('_', ' ') },
          ...(interaction.source.tool_name
            ? [{ label: 'Asked by', value: interaction.source.tool_name, mono: true }]
            : []),
          { label: 'Asked', value: new Date(interaction.created_at).toLocaleString() },
        ]}
      />
      {question && pending ? <OpenQuestionList questions={[interaction]} /> : null}
    </>
  );
}
