import { WrenchIcon } from 'lucide-react';
import { memo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import type { PendingInteraction, SubagentRun } from '@clio/core/v3';
import type { ConversationIteration } from './conversation-turn-model';
import { subagentsForTool } from './subagent-tool-link';
import {
  permissionInteractionForTool,
  questionInteractionsForTool,
  splitWaitingQuestion,
  toolWaitsForYou,
  withPermissionDecision,
} from './agent-answer-domain';
import { WaitingForYou } from './agent-answer-activity';
import { transcriptRunSummary } from './transcript-activity-summary';
import { ActivityDisclosure, ActivityNest, ActivityRow } from './activity-row';
import { StatusIndicator } from './primitives/status-indicator';
import { useTranscriptDisclosure } from './transcript-disclosure-context';

/** Rows a live step shows before the earlier ones fold behind "Show N earlier". */
const LANE_LIMIT = 6;
const LANE_TAIL = 4;
interface ActivityLaneProps {
  id: string;
  group: readonly ConversationIteration[];
  label: string;
  live: boolean;
  turnLive: boolean;
  subagents: Record<string, SubagentRun>;
  interactions?: readonly PendingInteraction[];
  /** Everything `children` reads besides the step, subagents and interactions. */
  rowInputs: readonly unknown[];
  children: (item: ConversationIteration) => ReactNode;
}

function sameItems(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function sameFields(a: object, b: object): boolean {
  if (a === b) return true;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => (a as Record<string, unknown>)[key] === (b as Record<string, unknown>)[key])
  );
}

/**
 * The parts of a step the lane reads. A streamed token rebuilds the step, but
 * its public text is read above the lane.
 */
function sameLaneSteps(
  a: readonly ConversationIteration[],
  b: readonly ConversationIteration[],
): boolean {
  return (
    a.length === b.length &&
    a.every((step, index) => {
      const other = b[index];
      return (
        step === other ||
        (step.id === other.id &&
          step.streaming === other.streaming &&
          step.interrupted === other.interrupted &&
          step.thinking.length === other.thinking.length &&
          step.thinking.every((thought, at) => sameFields(thought, other.thinking[at])) &&
          step.activity.length === other.activity.length &&
          step.activity.every((entry, at) => sameFields(entry, other.activity[at])))
      );
    })
  );
}

/**
 * A lane renders again only when its own steps or what its rows read change,
 * not for each token streamed elsewhere in the turn. `children` is rebuilt on
 * every parent render, so `rowInputs` stands for it.
 */
export const ActivityLane = memo(
  ActivityLaneView,
  // `children` is a fresh render prop each time; its closure is covered by rowInputs.
  (a, b) =>
    a.id === b.id &&
    a.label === b.label &&
    a.live === b.live &&
    a.turnLive === b.turnLive &&
    a.subagents === b.subagents &&
    a.interactions === b.interactions &&
    sameLaneSteps(a.group, b.group) &&
    sameItems(a.rowInputs, b.rowInputs),
);

function laneRows(item: ConversationIteration): number {
  return item.thinking.length + item.activity.length;
}

/** The last `keep` rows of a group, cutting iterations at their row boundaries. */
function laneTail(group: readonly ConversationIteration[], keep: number): ConversationIteration[] {
  let drop = group.reduce((total, item) => total + laneRows(item), 0) - keep;
  return group.flatMap((item) => {
    if (drop <= 0) return [item];
    const thinking = Math.min(drop, item.thinking.length);
    drop -= thinking;
    const entries = Math.min(drop, item.activity.length);
    drop -= entries;
    if (thinking === item.thinking.length && entries === item.activity.length && laneRows(item))
      return [];
    const activity = item.activity.slice(entries);
    return [
      {
        ...item,
        thinking: item.thinking.slice(thinking),
        activity,
        tools: activity.flatMap((entry) => (entry.kind === 'tool' ? [entry.tool] : [])),
        tasks: activity.flatMap((entry) => (entry.kind === 'task' ? [entry.task] : [])),
      },
    ];
  });
}

/**
 * A step's activity as flat rows in the conversation: thoughts, calls,
 * delegates and tasks, one 28px row each, in the order they happened. A long
 * step shows its latest rows; "Show N earlier" opens the rest and stays open.
 * Once the run has finished, it folds into one row that counts what it did,
 * "Called 3 tools, edited 2 files, delegated 1 task", and opens to all its rows.
 * The steps arrive without the thinking that is read above the lane.
 */
function ActivityLaneView({
  id,
  group,
  label,
  live,
  turnLive,
  subagents,
  interactions,
  children,
}: ActivityLaneProps) {
  const [all, setAll] = useTranscriptDisclosure(`activity:${id}`, false);
  const [runOpen, setRunOpen] = useTranscriptDisclosure(`run:${id}`, false);
  const total = group.reduce((sum, item) => sum + laneRows(item), 0);
  // While the turn works, steps after the last call that only think are the
  // agent moving on; they stay below the run. Once it has settled, the whole
  // block between two updates is the run.
  let headEnd = group.length;
  while (
    turnLive &&
    headEnd > 0 &&
    !group[headEnd - 1].activity.length &&
    !group[headEnd - 1].interrupted
  )
    headEnd -= 1;
  const head = group.slice(0, headEnd);
  const afterIds = new Set(group.slice(headEnd).map((item) => item.id));
  // A settled run folds once the agent has moved past it, a single call too, so
  // the work reads as one row between updates; thoughts alone stay as they are.
  const headCalls = head.reduce(
    (sum, item) => sum + item.activity.filter((entry) => entry.kind !== 'diff').length,
    0,
  );
  const collapses =
    (!turnLive || afterIds.size > 0) && headCalls > 0 && runSettled(head, interactions);
  // A folded run already counts its rows, so opening it shows every one of them.
  const folded = !all && !collapses && total > LANE_LIMIT;
  const shown = folded ? laneTail(group, LANE_TAIL) : group;
  const earlier = folded ? total - shown.reduce((sum, item) => sum + laneRows(item), 0) : 0;
  // While a call in a longer run waits on the person, the run's row already shows,
  // open, with "waiting for you" in place of its outcome. A lone call says it itself.
  const waiting =
    !collapses &&
    headCalls > 1 &&
    head.some((item) => item.tools.some((tool) => toolWaitsForYou(tool, interactions)));
  const showAll = folded ? (
    <Button
      variant="ghost"
      onClick={() => setAll(true)}
      className="mt-1 ml-[22px] h-6 rounded-[4px] px-2 text-[11.5px] font-normal text-muted-foreground hover:bg-hover hover:text-foreground"
      data-slot="activity-show-all"
    >
      {`Show ${earlier} earlier`}
    </Button>
  ) : null;
  const run =
    collapses || waiting
      ? transcriptRunSummary(
          head.map((item) => ({
            ...item,
            // A call the person refused is counted as denied, not failed.
            tools: item.tools.map((tool) => withPermissionDecision(tool, interactions)),
          })),
          (tool) => subagentsForTool(tool, subagents).map((subagent) => subagent.id),
        )
      : undefined;
  return (
    <div
      role="group"
      aria-label={`Activity: ${collapses && run ? run.label : label}`}
      aria-busy={live || undefined}
      // Top-level rows sit 4px apart (a 32px pitch); rows one step in stay at 28px.
      // The lane's -mt-1 takes back the first row's margin so text to row stays 8px.
      className="-mt-1 min-w-0 [&_[data-slot=activity-row]:not([data-slot=activity-nest]_*):not([data-slot=activity-body]_*)]:mt-1"
      data-row-run=""
      data-run-collapsed={collapses && !runOpen ? '' : undefined}
      data-run-waiting={waiting ? '' : undefined}
      data-slot="transcript-activity-timeline"
      // A reader who opens something in a run while it works keeps it open
      // when the run folds at the end of the turn.
      onClickCapture={collapses || runOpen ? undefined : () => setRunOpen(true)}
      onKeyDownCapture={
        collapses || runOpen
          ? undefined
          : (event) => {
              if (event.key === 'Enter' || event.key === ' ') setRunOpen(true);
            }
      }
    >
      {run && waiting ? (
        <ActivityRow
          data-run-summary=""
          icon={<WrenchIcon aria-hidden="true" />}
          name={run.label}
          outcome={<WaitingForYou />}
          outcomeTitle="waiting for you"
          outcomeTone="muted"
          status={
            <StatusIndicator display="column" label="Waiting for you" mark="glyph" tone="running" />
          }
        />
      ) : run ? (
        <ActivityRow
          aria-expanded={runOpen}
          data-run-summary=""
          disclosure={
            <ActivityDisclosure
              label={`${runOpen ? 'Collapse' : 'Expand'} ${run.label}`}
              open={runOpen}
              onClick={() => setRunOpen(!runOpen)}
            />
          }
          icon={<WrenchIcon aria-hidden="true" />}
          name={run.label}
          onOpenChange={setRunOpen}
          open={runOpen}
          outcome={
            run.failed || run.denied || run.interrupted ? (
              <span>
                {[
                  run.failed ? (
                    <span key="failed" className="text-destructive">
                      {run.failed} failed
                    </span>
                  ) : null,
                  run.denied ? (
                    <span key="denied" className="text-warning">
                      {run.denied} denied
                    </span>
                  ) : null,
                  run.interrupted ? <span key="stopped">{run.interrupted} stopped</span> : null,
                ]
                  .filter(Boolean)
                  .flatMap((part, index) => (index ? [', ', part] : [part]))}
              </span>
            ) : undefined
          }
          outcomeTitle={
            [
              run.failed ? `${run.failed} failed` : '',
              run.denied ? `${run.denied} denied` : '',
              run.interrupted ? `${run.interrupted} stopped` : '',
            ]
              .filter(Boolean)
              .join(', ') || undefined
          }
          outcomeTone="muted"
          status={
            <StatusIndicator
              display="column"
              label={
                run.failed
                  ? 'Some calls failed'
                  : run.denied
                    ? 'Some calls were denied'
                    : run.interrupted
                      ? 'Stopped'
                      : 'Done'
              }
              mark="glyph"
              tone={
                run.failed
                  ? 'error'
                  : run.denied
                    ? 'warning'
                    : run.interrupted
                      ? 'stopped'
                      : 'success'
              }
            />
          }
        />
      ) : null}
      {/* One parent in both shapes keeps each row's own state when the run folds. */}
      {collapses && !runOpen ? null : (
        <ActivityNest flat={!run} label={`Calls: ${(collapses && run?.label) || label}`}>
          {showAll}
          {shown.filter((item) => !afterIds.has(item.id)).map(children)}
        </ActivityNest>
      )}
      {shown.filter((item) => afterIds.has(item.id)).map(children)}
    </div>
  );
}

/** Nothing in the run is still working or waiting, so it can fold. */
function runSettled(
  group: readonly ConversationIteration[],
  interactions: readonly PendingInteraction[] | undefined,
): boolean {
  return group.every(
    (item) =>
      !item.streaming &&
      item.thinking.every((thought) => !thought.streaming) &&
      item.tools.every(
        (tool) =>
          !['pending', 'running'].includes(tool.state) &&
          !permissionInteractionForTool(interactions, tool) &&
          !splitWaitingQuestion(questionInteractionsForTool(interactions, tool.id)).waiting,
      ) &&
      // A task waiting on the person is not settled: its row stays where they read.
      item.tasks.every(
        (task) => !['queued', 'running', 'waiting_permission', 'waiting_user'].includes(task.state),
      ),
  );
}
