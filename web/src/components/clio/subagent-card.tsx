import { subagentOpenTarget, SUBAGENT_OPEN_HINT } from './subagent-navigation';
import type { MessageBlock, RunState, SubagentRun } from '@clio/core/v3';
import { BotIcon, MessageSquareIcon, ShieldCheckIcon } from 'lucide-react';
import { useContext, useState, type MouseEvent, type ReactNode } from 'react';
import { InfoIcon } from '@/lib/icon-vocabulary';
import { CollapsibleContent, Collapsible, CollapsibleTrigger } from '@/components/ui/collapsible';
import { formatDuration } from '@/lib/format';
import { getChildAgentAssignment } from './child-agent-presentation';
import { clioStatusLabel } from './status';
import { SubagentModel } from './subagent-model';
import { useTranscriptDisclosure } from './transcript-disclosure-context';
import { BoundedResult } from './bounded-result';
import { GroundedMessageResponse } from './grounded-message-response';
import { useTranscriptPreviewLines } from '@/providers/appearance-provider';
import { DelegateCalls } from './delegate-calls';
import {
  ActivityBody,
  ActivityDisclosure,
  ActivityInfoButton,
  ActivityRow,
  type ActivityOutcomeTone,
} from './activity-row';
import { CopyAction } from './tool-compact-row';
import { DialogFrame } from './primitives/dialog-frame';
import type { KeyValueItem } from './primitives/key-value-grid';
import { DetailsSection, TechnicalDetailsFacts } from './tool-technical-details';
import { NamedTooltip } from './primitives/icon-button';
import { StatusIndicator, type StatusTone } from './primitives/status-indicator';
import { delegateTone } from './delegate-tone';
import { PresentationNavigation } from './presentation-navigation';

export interface ClioSubagentCardProps {
  subagent?: SubagentRun;
  onOpen?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
}

export type SubagentOpenTarget = 'conversation' | 'canvas';

type SubagentBlock = Extract<MessageBlock, { type: 'subagent' }>;
type OpenSubagent = (subagent: SubagentRun, target: SubagentOpenTarget) => void;

export interface ClioSubagentLifecycleLineProps {
  stage: NonNullable<SubagentBlock['stage']>;
  subagent?: SubagentRun;
  task?: string;
  onOpen?: OpenSubagent;
}

export interface ClioAgentMessageLineProps {
  block: Extract<MessageBlock, { type: 'agent_message' }>;
  subagent?: SubagentRun;
  onOpen?: OpenSubagent;
}

const OUTCOME_TONE: Partial<Record<StatusTone, ActivityOutcomeTone>> = {
  error: 'error',
  warning: 'warning',
  waiting: 'warning',
  stopped: 'muted',
  idle: 'muted',
};

/** The agent's name: "geospatial", or the skill it runs for. */
function agentName(subagent: SubagentRun | undefined): string {
  return subagent?.agent_id || subagent?.origin?.name || subagent?.title || 'Child agent';
}

/** The agent as an accent link: opens its conversation in a workbench tab, Shift in the center. */
function AgentLink({
  subagent,
  label,
  onOpen,
}: {
  subagent?: SubagentRun;
  label: string;
  onOpen?: OpenSubagent;
}) {
  const navigation = useContext(PresentationNavigation);
  const open = onOpen ?? navigation?.onOpenSubagent;
  const className =
    'max-w-full truncate text-[12.5px] font-medium text-accent-foreground underline decoration-accent-foreground/40 underline-offset-[3px]';
  if (!subagent?.child_session_id || !open) {
    return (
      <span className={className.replace(/ underline.*$/u, '')} data-slot="delegate-agent">
        {label}
      </span>
    );
  }
  return (
    <NamedTooltip label={SUBAGENT_OPEN_HINT}>
      <button
        type="button"
        data-slot="delegate-agent"
        aria-label={`Open ${label}`}
        className={`${className} rounded-[3px] hover:decoration-accent-foreground focus-visible:outline-[1.5px] focus-visible:outline-ring`}
        onMouseDown={(event) => {
          if (event.shiftKey) event.preventDefault();
        }}
        onClick={(event: MouseEvent<HTMLButtonElement>) =>
          open(subagent, subagentOpenTarget(event))
        }
      >
        {label}
      </button>
    </NamedTooltip>
  );
}

/** ⓘ on a delegate: who ran, on what model, for how long, and the full assignment. */
function DelegateDetailsDialog({
  open,
  onOpenChange,
  subagent,
  task,
  action,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subagent?: SubagentRun;
  task: string;
  action: string;
}) {
  const items: KeyValueItem[] = [
    {
      label: 'Agent',
      value: <span className="min-w-0 truncate text-accent-foreground">{agentName(subagent)}</span>,
      title: agentName(subagent),
    },
    ...(subagent?.title && subagent.title !== agentName(subagent)
      ? [{ label: 'Run', value: subagent.title }]
      : []),
    ...(subagent?.model_choice
      ? [{ label: 'Model', value: <SubagentModel choice={subagent.model_choice} /> }]
      : []),
    ...(subagent ? [{ label: 'State', value: clioStatusLabel(subagent.state) }] : []),
    ...(subagent?.duration_ms !== undefined
      ? [{ label: 'Execution time', value: formatDuration(subagent.duration_ms, 'elapsed') }]
      : []),
    ...(subagent?.origin ? [{ label: 'Skill', value: subagent.origin.name, mono: true }] : []),
  ];
  return (
    <DialogFrame
      open={open}
      onOpenChange={onOpenChange}
      icon={<InfoIcon className="size-4" />}
      title={`${action}: Technical details`}
      description={
        subagent?.duration_ms !== undefined
          ? 'The delegated assignment, the agent that ran it, and its timing.'
          : 'The delegated assignment and the agent that ran it.'
      }
      className="w-[clamp(360px,56vw,760px)]"
    >
      <div className="grid max-h-[65dvh] min-w-0 gap-2.5 overflow-auto text-[12.5px] [overflow-wrap:anywhere]">
        <TechnicalDetailsFacts items={items} />
        {task ? (
          <DetailsSection title="Assignment" copy={task}>
            <p className="whitespace-pre-wrap text-muted-foreground">{task}</p>
          </DetailsSection>
        ) : null}
      </div>
    </DialogFrame>
  );
}

/**
 * One delegation as an activity row: "Delegate", the agent as a link, the
 * assignment, then elapsed, state and ? in the fixed columns. Opening it shows
 * the full assignment and whatever the agent returned.
 */
export function ClioDelegateRow({
  action = 'Delegate',
  subagent,
  task,
  result,
  state,
  onOpen,
  disclosureKey,
}: {
  /** "Delegate", "Continue subagent", "Subagent turn ended". */
  action?: string;
  subagent?: SubagentRun;
  task: string;
  /** What the agent returned; shown in the body once it has. */
  result?: string;
  /** Override the run's state (a launch line was accepted, whatever came next). */
  state?: RunState;
  onOpen?: OpenSubagent;
  disclosureKey?: string;
}) {
  const [open, setOpen] = useTranscriptDisclosure(disclosureKey);
  const [details, setDetails] = useState(false);
  const runState = state ?? subagent?.state ?? 'running';
  const tone = delegateTone(runState);
  const statusLabel = clioStatusLabel(runState);
  const name = agentName(subagent);
  const outcomeTone = OUTCOME_TONE[tone];
  const body = Boolean(subagent || result);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="min-w-0" data-slot="delegate">
      <ActivityRow
        open={open}
        onOpenChange={body ? setOpen : undefined}
        aria-label={`${action} ${name}`}
        disclosure={
          body ? (
            <ActivityDisclosure
              open={open}
              label={`${open ? 'Collapse' : 'Expand'} ${action}`}
              asChildTrigger={(button) => <CollapsibleTrigger asChild>{button}</CollapsibleTrigger>}
            />
          ) : undefined
        }
        icon={<BotIcon aria-hidden="true" />}
        name={<span data-slot="tool-action-text">{action}</span>}
        link={<AgentLink subagent={subagent} label={name} onOpen={onOpen} />}
        argument={task ? task.replace(/\s+/gu, ' ').trim() : undefined}
        argumentTitle={task || undefined}
        outcome={outcomeTone ? statusLabel.toLowerCase() : undefined}
        outcomeTone={outcomeTone}
        actions={task ? <CopyAction value={task} label="Copy assignment" /> : null}
        elapsed={
          subagent?.duration_ms !== undefined ? (
            <span data-slot="tool-duration">{formatDuration(subagent.duration_ms, 'compact')}</span>
          ) : null
        }
        status={<StatusIndicator tone={tone} label={statusLabel} display="column" mark="glyph" />}
        info={
          <ActivityInfoButton
            label={`Technical details for ${action}`}
            hint="View the agent, model, assignment, and timing"
            onClick={() => setDetails(true)}
          />
        }
      />
      {body ? (
        <CollapsibleContent>
          {open ? <DelegateCalls name={name} result={result} subagent={subagent} /> : null}
        </CollapsibleContent>
      ) : null}
      {details ? (
        <DelegateDetailsDialog
          open={details}
          onOpenChange={setDetails}
          subagent={subagent}
          task={task}
          action={action}
        />
      ) : null}
    </Collapsible>
  );
}

/** A child launch, continuation or return, at its recorded transcript position. */
export function ClioSubagentLifecycleLine({
  stage,
  subagent,
  task,
  onOpen,
}: ClioSubagentLifecycleLineProps) {
  const started = stage === 'delegate.started';
  const continued = stage === 'delegate.superseded';
  const terminal = !started && !continued;
  const failed = terminal && subagent?.state === 'failed';
  const cancelled = terminal && subagent?.state === 'cancelled';
  const assignment = task?.trim() || (subagent ? getChildAgentAssignment(subagent).label : '');
  // A return says in its name what happened: a turn that ended is not a claim
  // that the assignment succeeded.
  const action = started
    ? 'Delegate'
    : continued
      ? 'Continue subagent'
      : failed
        ? 'Subagent failed'
        : cancelled
          ? 'Subagent cancelled'
          : 'Subagent turn ended';
  return (
    <ClioDelegateRow
      action={action}
      subagent={subagent}
      task={assignment}
      result={terminal ? subagent?.result || subagent?.summary : undefined}
      state={
        terminal && !failed && !cancelled && subagent && delegateTone(subagent.state) === 'running'
          ? 'completed'
          : undefined
      }
      onOpen={onOpen}
      disclosureKey={`delegate:${subagent?.id ?? 'child'}:${stage}`}
    />
  );
}

/** One message delivered to a child, kept at its recorded transcript position. */
export function ClioAgentMessageLine({ block, subagent, onOpen }: ClioAgentMessageLineProps) {
  const [expanded, setExpanded] = useTranscriptDisclosure(`agent-message:${block.id}`);
  const lines = useTranscriptPreviewLines();
  const failed = block.status === 'failed';
  const recipient = subagent?.title || block.label || 'an agent';
  const label = `${failed ? 'Message could not be sent to' : 'Sent message to'} ${recipient}`;
  return (
    <Collapsible
      open={expanded}
      onOpenChange={setExpanded}
      className="min-w-0"
      data-slot="agent-message"
    >
      <ActivityRow
        open={expanded}
        onOpenChange={setExpanded}
        disclosure={
          <ActivityDisclosure
            open={expanded}
            label={label}
            asChildTrigger={(button) => <CollapsibleTrigger asChild>{button}</CollapsibleTrigger>}
          />
        }
        icon={<MessageSquareIcon aria-hidden="true" />}
        name="Message"
        link={
          subagent ? (
            <AgentLink subagent={subagent} label={agentName(subagent)} onOpen={onOpen} />
          ) : (
            <span className="truncate text-[12.5px] text-foreground/85">{recipient}</span>
          )
        }
        argument={block.message.replace(/\s+/gu, ' ').trim()}
        outcome={failed ? 'not sent' : undefined}
        actions={<CopyAction value={block.message} label="Copy message" />}
        elapsed={null}
        status={
          <StatusIndicator
            tone={failed ? 'error' : 'success'}
            label={failed ? 'Not sent' : 'Sent'}
            display="column"
            mark="glyph"
          />
        }
        info={null}
      />
      <CollapsibleContent>
        <ActivityBody label={label} className="px-3 py-2.5">
          <BoundedResult lines={lines} title={label}>
            <GroundedMessageResponse mode="static">{block.message}</GroundedMessageResponse>
          </BoundedResult>
        </ActivityBody>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** A delegation recorded on its own (a dispatch block), as one delegate row. */
export function ClioSubagentCard({ subagent, onOpen }: ClioSubagentCardProps) {
  if (!subagent) {
    return (
      <ClioDelegateRow
        task="Waiting for the live child record."
        state="queued"
        subagent={undefined}
        action="Connecting child agent"
      />
    );
  }
  if (isSpotterWatcher(subagent)) return <SpotterWatcherLine subagent={subagent} onOpen={onOpen} />;
  return (
    <ClioDelegateRow
      subagent={subagent}
      task={getChildAgentAssignment(subagent).label}
      result={subagent.result}
      onOpen={onOpen}
      disclosureKey={`delegate-card:${subagent.id}`}
    />
  );
}

/** The standing SPOTTER watcher (run label "SPOTTER AI") armed by the SPOTTER review policy. */
function isSpotterWatcher(subagent: SubagentRun): boolean {
  return subagent.title.startsWith('SPOTTER AI') || subagent.agent_id === 'spotter_watcher';
}

/** One quiet row: the watcher has no assignment of its own. */
function SpotterWatcherLine({
  subagent,
  onOpen,
}: {
  subagent: SubagentRun;
  onOpen?: OpenSubagent;
}) {
  const interactive = Boolean(subagent.child_session_id && onOpen);
  const busy = subagent.state === 'running' || subagent.state === 'queued';
  const link: ReactNode = interactive ? (
    <NamedTooltip label={SUBAGENT_OPEN_HINT}>
      <button
        type="button"
        aria-label="Open the SPOTTER review conversation"
        data-slot="delegate-agent"
        className="truncate rounded-[3px] text-[12.5px] font-medium text-accent-foreground underline decoration-accent-foreground/40 underline-offset-2 focus-visible:outline-[1.5px] focus-visible:outline-ring"
        onClick={(event) => onOpen?.(subagent, subagentOpenTarget(event))}
      >
        SPOTTER
      </button>
    </NamedTooltip>
  ) : (
    <span className="text-[12.5px] font-medium">SPOTTER</span>
  );
  return (
    <ActivityRow
      icon={<ShieldCheckIcon aria-hidden="true" className="text-primary" />}
      name="Review"
      link={link}
      argument={busy ? 'reviewing this session' : 'watching this session'}
      elapsed={null}
      status={
        <StatusIndicator
          tone={busy ? 'running' : 'idle'}
          label={busy ? 'Reviewing' : 'Watching'}
          display="column"
          mark="glyph"
        />
      }
      info={null}
    />
  );
}
