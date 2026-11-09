import type { ToolInvocation } from '@clio/core/v3';
import { createElement, Fragment, useState, type ReactNode } from 'react';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CollapsibleTrigger } from '@/components/ui/collapsible';
import { copyText } from '@/lib/clipboard';
import { formatDuration } from '@/lib/format';
import { toolKindIcon } from '@/lib/tool-kind-icons';
import { cn } from '@/lib/utils';
import {
  getToolActionLabel,
  getToolFailureDetail,
  getToolStatus,
  getToolInterruptionDetail,
} from './tool-presentation';
import { PresentationLink } from './presentation-link';
import type { ToolOperation } from './tool-operation';
import { clioStatusLabel } from './status';
import { ActivityDisclosure, ActivityRow } from './activity-row';
import { NamedTooltip } from './primitives/icon-button';
import { StatusIndicator, type StatusTone } from './primitives/status-indicator';

const ARGUMENT_CLASS = 'font-mono text-[11.5px] text-muted-foreground no-underline hover:underline';
const AGENT_LINK_CLASS =
  'max-w-[16rem] truncate text-[12.5px] font-medium text-accent-foreground underline decoration-accent-foreground/40 underline-offset-2';

/** One tool call as an activity row: name, argument, outcome, then fixed right columns. */
export function ToolCompactRow({
  tool,
  operation,
  attention,
  badge,
  duration,
  expanded,
  surface = 'transcript',
  onOpenFlow,
  onExpandedChange,
  info,
  waiting,
}: {
  tool: ToolInvocation;
  operation: ToolOperation;
  attention?: ReactNode;
  /** The call is paused on the user: the "waiting for you" outcome that jumps to the card. */
  waiting?: ReactNode;
  /** The 58px badge column: Sandbox or Blocked. */
  badge?: ReactNode;
  duration?: number;
  expanded: boolean;
  surface?: 'transcript' | 'evidence';
  onOpenFlow?: () => void;
  onExpandedChange?: (open: boolean) => void;
  /** The ⓘ technical-details control. */
  info?: ReactNode;
}) {
  const status = getToolStatus(tool);
  const active = status === 'pending' || status === 'running';
  const success = status === 'succeeded';
  const interrupted = status === 'interrupted';
  const failure =
    (interrupted ? getToolInterruptionDetail(tool) : undefined) || getToolFailureDetail(tool);
  const action = operation.action || getToolActionLabel(tool);
  // A question still waiting on the person is work in progress, even when its
  // call has already returned, so the row never shows a done mark beside it.
  const statusLabel = waiting
    ? 'Waiting for you'
    : interrupted
      ? failure || clioStatusLabel(status)
      : failure
        ? `${clioStatusLabel(status)}: ${failure.length > 300 ? `${failure.slice(0, 300)}…` : failure}`
        : clioStatusLabel(status);
  const tone: StatusTone = waiting
    ? 'running'
    : interrupted
      ? 'stopped'
      : active
        ? 'running'
        : success
          ? 'success'
          : status === 'unknown' || status === 'degraded'
            ? 'warning'
            : 'error';
  const codeArgument = operation.subjects.some(
    (subject) =>
      subject.id === 'operation-command' ||
      subject.target === 'file' ||
      /^(fs_|shell_|run_code|ssh_)/u.test(tool.name),
  );
  const argument = operation.subjects.length ? (
    <>
      {operation.subjects.map((subject, index) => (
        <Fragment key={`${subject.id}-${index}`}>
          {index && index === operation.subjects.length - 1 ? ' and ' : null}
          {onOpenFlow && index === 0 ? (
            <Button
              variant="link"
              className="h-auto p-0 text-[12.5px] font-medium text-accent-foreground underline decoration-primary/45 underline-offset-[3px]"
              onClick={onOpenFlow}
            >
              {subject.label || subject.text}
            </Button>
          ) : subject.type === 'link' ? (
            <PresentationLink
              block={subject}
              compact
              className={codeArgument ? ARGUMENT_CLASS : 'text-[12.5px] text-foreground/85'}
            />
          ) : subject.id === 'operation-command' ? (
            (subject.text || subject.label || '').split('\n', 1)[0]
          ) : (
            subject.label || subject.text
          )}
          {index < operation.subjects.length - 2 ? ', ' : null}
        </Fragment>
      ))}
      {operation.qualifier ? ` ${operation.qualifier}` : null}
    </>
  ) : operation.qualifier ? (
    operation.qualifier
  ) : undefined;
  // One assignment reads as the spec's delegate row: Delegate, the agent as a link, the task.
  const delegate =
    operation.kind === 'assignments' && operation.tasks?.length === 1
      ? operation.tasks[0]
      : undefined;
  const delegateLink = delegate ? (
    delegate.subject.type === 'link' ? (
      <PresentationLink block={delegate.subject} compact className={AGENT_LINK_CLASS} />
    ) : (
      <span className={AGENT_LINK_CLASS}>{delegate.subject.label || delegate.subject.text}</span>
    )
  ) : undefined;
  const argumentTitle = operation.subjects
    .map((subject) => subject.text || subject.uri || subject.label)
    .filter(Boolean)
    .join(', ');
  // A failure is named in words, not only by its mark's colour; success stays quiet and a
  // partial outcome is counted in words by the operation's own metadata.
  const failureWord =
    !active && !success && !interrupted && !(status === 'degraded' && operation.metadata)
      ? (exitCodeOf(tool) ?? (status === 'unknown' ? 'Unknown' : status))
      : undefined;
  const metadata = operation.metadata ? (
    <span data-slot="activity-metadata" className="text-muted-foreground">
      {operation.metadata}
    </span>
  ) : null;
  const outcome =
    waiting || metadata || failureWord ? (
      <>
        {metadata}
        {waiting}
        {failureWord ? (
          <span
            data-slot="tool-outcome"
            className={
              status === 'unknown' || status === 'degraded' ? 'text-warning' : 'text-destructive'
            }
          >
            {failureWord}
          </span>
        ) : null}
      </>
    ) : undefined;
  const copyValue = copyTarget(operation);
  const openSubject = operation.subjects.find(
    (subject) => subject.type === 'link' && subject.target && subject.target !== 'url',
  );
  return (
    <ActivityRow
      className={cn('flex-1', surface === 'evidence' && 'h-8')}
      open={expanded}
      onOpenChange={operation.expandable ? onExpandedChange : undefined}
      disclosure={
        operation.expandable ? (
          <ActivityDisclosure
            open={expanded}
            label={`${expanded ? 'Collapse' : 'Expand'} ${action}`}
            asChildTrigger={(button) => <CollapsibleTrigger asChild>{button}</CollapsibleTrigger>}
          />
        ) : null
      }
      icon={createElement(toolKindIcon(tool.name))}
      name={
        <CollapsibleTrigger asChild>
          <button
            type="button"
            disabled={!operation.expandable}
            aria-label={`Show result for ${action}`}
            data-slot="tool-action-text"
            className="cursor-pointer rounded-[3px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-default"
          >
            {action}
          </button>
        </CollapsibleTrigger>
      }
      link={delegateLink}
      argument={delegate ? delegate.assignment : argument}
      argumentStyle={codeArgument && !delegate ? 'code' : 'text'}
      argumentTitle={(delegate ? delegate.assignment : argumentTitle) || undefined}
      outcome={outcome}
      outcomeTone="muted"
      outcomeTitle={failure}
      marks={attention}
      badge={badge}
      actions={
        copyValue || openSubject ? (
          <>
            {copyValue ? (
              <CopyAction value={copyValue.value} label={copyValue.label} />
            ) : (
              <span className="w-[22px]" />
            )}
            {openSubject ? (
              <span data-activity-action="open" className="grid size-[22px] place-items-center">
                <PresentationLink block={openSubject} compact iconOnly />
              </span>
            ) : null}
          </>
        ) : null
      }
      elapsed={
        duration !== undefined ? (
          <span
            data-slot="tool-duration"
            title={active ? 'Elapsed time; updates while running' : 'Execution time'}
          >
            {formatDuration(duration, 'elapsed')}
          </span>
        ) : null
      }
      status={<StatusIndicator tone={tone} label={statusLabel} display="column" mark="glyph" />}
      info={info}
    />
  );
}

/** The copy hover action: the command, path or output the row names. */
export function CopyAction({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <NamedTooltip label={copied ? 'Copied' : label}>
      <Button
        variant="ghost"
        aria-label={label}
        data-activity-action="copy"
        className="size-[22px] rounded-[5px] p-0 text-muted-foreground hover:bg-hover hover:text-foreground [&_svg]:size-[13px]"
        onClick={() => {
          void copyText(value).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          });
        }}
      >
        {copied ? (
          <CheckIcon aria-hidden="true" className="size-[13px]" />
        ) : (
          <CopyIcon aria-hidden="true" className="size-[13px]" />
        )}
      </Button>
    </NamedTooltip>
  );
}

function copyTarget(operation: ToolOperation): { value: string; label: string } | undefined {
  const command = operation.subjects.find((subject) => subject.id === 'operation-command');
  if (command?.text) return { value: command.text, label: 'Copy command' };
  const file = operation.subjects.find((subject) => subject.target === 'file');
  if (file?.uri || file?.text) return { value: file.uri || file.text || '', label: 'Copy path' };
  const first = operation.subjects[0];
  const text = first?.text || first?.uri || first?.label;
  return text ? { value: text, label: 'Copy' } : undefined;
}

function exitCodeOf(tool: ToolInvocation): string | undefined {
  const output = tool.output as Record<string, unknown> | undefined;
  const nested =
    output && typeof output === 'object'
      ? ((output.structuredContent as Record<string, unknown> | undefined) ??
        ((output.result as Record<string, unknown> | undefined)?.structuredContent as
          | Record<string, unknown>
          | undefined) ??
        output)
      : undefined;
  const code = nested?.exit_code;
  return typeof code === 'number' && code !== 0 ? `exit ${code}` : undefined;
}
