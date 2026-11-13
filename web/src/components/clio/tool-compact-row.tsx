import type { ToolInvocation } from '@clio/core/v3';
import { createElement, Fragment, useState, type ReactNode } from 'react';
import { CheckIcon, CopyIcon, OctagonMinusIcon, ShieldQuestionIcon } from 'lucide-react';
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
import { humanFailureText } from './composer-failure';
import { ActivityDisclosure, ActivityRow } from './activity-row';
import { NamedTooltip } from './primitives/icon-button';
import { StatusIndicator, type StatusTone } from './primitives/status-indicator';
import { ph, t } from '@lingui/core/macro';

const ARGUMENT_CLASS = 'font-mono text-label text-muted-foreground no-underline hover:underline';
const AGENT_LINK_CLASS =
  'max-w-[16rem] truncate text-menu font-medium text-accent-foreground underline decoration-accent-foreground/40 underline-offset-2';

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
  const cancelled = status === 'cancelled';
  // A call the person refused folds into the spec's decision row: "Denied · target · you denied it".
  const denied = !waiting && status === 'denied';
  const failure =
    (interrupted ? getToolInterruptionDetail(tool) : undefined) || getToolFailureDetail(tool);
  // The status mark's name and the outcome's hover read as a sentence; a trace or a
  // validation dump stays in the expanded call and its technical details.
  const failureText = failure
    ? (humanFailureText(failure) ??
      (/validation errors? for /i.test(failure) ? t`Its arguments were not valid.` : undefined))
    : undefined;
  const action = operation.action || getToolActionLabel(tool);
  // A question still waiting on the person is work in progress, even when its
  // call has already returned, so the row never shows a done mark beside it.
  const statusLabel = waiting
    ? t`Waiting for you`
    : denied
      ? t`Denied`
      : interrupted
        ? failure || clioStatusLabel(status)
        : cancelled
          ? t`Stopped`
          : failureText
            ? t`${ph({ status: clioStatusLabel(status) })}: ${failureText}`
            : clioStatusLabel(status);
  const tone: StatusTone = waiting
    ? 'running'
    : interrupted || cancelled || denied
      ? 'stopped'
      : active
        ? 'running'
        : success
          ? 'success'
          : status === 'unknown' || status === 'degraded'
            ? 'warning'
            : 'error';
  const argument = operation.subjects.length ? (
    <>
      {operation.subjects.map((subject, index) => (
        <Fragment key={`${subject.id}-${index}`}>
          {index && index === operation.subjects.length - 1 ? ' and ' : null}
          {onOpenFlow && index === 0 ? (
            <Button
              variant="link"
              className="h-auto p-0 text-menu font-medium text-accent-foreground underline decoration-primary/45 underline-offset-[3px]"
              onClick={onOpenFlow}
            >
              {subject.label || subject.text}
            </Button>
          ) : subject.type === 'link' ? (
            <PresentationLink block={subject} compact className={ARGUMENT_CLASS} />
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
    !waiting &&
    !denied &&
    !active &&
    !success &&
    !interrupted &&
    !(status === 'degraded' && operation.metadata)
      ? cancelled
        ? t({ message: 'stopped', context: 'tool outcome' })
        : (exitCodeOf(tool) ?? outcomeWord(status))
      : undefined;
  const outcome =
    waiting || failureWord || denied ? (
      <>
        {waiting}
        {denied ? (
          <span data-slot="tool-outcome" className="text-warning">
            {tool.presentation?.blocks.find((block) => block.id === 'permission-decision')?.text ||
              t`you denied it`}
          </span>
        ) : null}
        {failureWord ? (
          <span
            data-slot="tool-outcome"
            className={
              cancelled
                ? 'text-muted-foreground'
                : status === 'unknown' || status === 'degraded'
                  ? 'text-warning'
                  : 'text-destructive'
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
            label={
              expanded
                ? denied
                  ? t`Collapse denied ${ph({ action })}`
                  : t`Collapse ${ph({ action })}`
                : denied
                  ? t`Expand denied ${ph({ action })}`
                  : t`Expand ${ph({ action })}`
            }
            asChildTrigger={(button) => <CollapsibleTrigger asChild>{button}</CollapsibleTrigger>}
          />
        ) : null
      }
      icon={
        denied ? <ShieldQuestionIcon aria-hidden="true" /> : createElement(toolKindIcon(tool.name))
      }
      name={
        <CollapsibleTrigger asChild>
          <button
            type="button"
            disabled={!operation.expandable}
            aria-label={
              denied
                ? t`Show result for denied ${ph({ action })}`
                : t`Show result for ${ph({ action })}`
            }
            data-slot="tool-action-text"
            // The chevron is the row's tab stop; the name repeats it for the pointer.
            tabIndex={-1}
            className="cursor-pointer rounded-[3px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-default"
          >
            {denied ? t`Denied` : action}
          </button>
        </CollapsibleTrigger>
      }
      link={delegateLink}
      argument={delegate ? delegate.assignment : argument}
      argumentTitle={(delegate ? delegate.assignment : argumentTitle) || undefined}
      recap={operation.metadata}
      recapTitle={typeof operation.metadata === 'string' ? operation.metadata : undefined}
      outcome={outcome}
      outcomeTone="muted"
      outcomeTitle={failureText}
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
            title={active ? t`Elapsed time; updates while running` : t`Execution time`}
          >
            {formatDuration(duration, 'elapsed')}
          </span>
        ) : null
      }
      status={
        <StatusIndicator
          tone={tone}
          label={statusLabel}
          display="column"
          mark="glyph"
          icon={
            denied ? (
              <OctagonMinusIcon aria-hidden="true" className="size-3.5 text-warning" />
            ) : undefined
          }
        />
      }
      info={info}
    />
  );
}

/** The copy hover action: the command, path or output the row names. */
export function CopyAction({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <NamedTooltip label={copied ? t`Copied` : label}>
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
  if (command?.text) return { value: command.text, label: t`Copy command` };
  const file = operation.subjects.find((subject) => subject.target === 'file');
  if (file?.uri || file?.text) return { value: file.uri || file.text || '', label: t`Copy path` };
  const first = operation.subjects[0];
  const text = first?.text || first?.uri || first?.label;
  return text ? { value: text, label: t`Copy` } : undefined;
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
  return typeof code === 'number' && code !== 0 ? t`exit ${code}` : undefined;
}

/** A failed call's status as the lower-case outcome word; an unrecognized one reads as reported. */
function outcomeWord(status: string): string {
  if (status === 'unknown') return t`Unknown`;
  if (status === 'failed') return t({ message: 'failed', context: 'tool outcome' });
  if (status === 'degraded') return t({ message: 'degraded', context: 'tool outcome' });
  if (status === 'denied') return t({ message: 'denied', context: 'tool outcome' });
  return status;
}
