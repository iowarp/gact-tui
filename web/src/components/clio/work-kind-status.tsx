import {
  BotIcon,
  CircleAlertIcon,
  Clock3Icon,
  LoaderCircleIcon,
  MessageCircleQuestionIcon,
  PauseIcon,
  WorkflowIcon,
  WrenchIcon,
  XIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

import type { WorkKind } from './work-kind';

const kinds = {
  agent: { label: 'Agent', icon: BotIcon },
  question: { label: 'Question', icon: MessageCircleQuestionIcon },
  tool: { label: 'Tool', icon: WrenchIcon },
  workflow: { label: 'Flow', icon: WorkflowIcon },
};

/** Kind/state glyph for rail and Evidence/Work task lists, not transcript tool calls. */
export function WorkKindStatus({
  kind,
  status,
  detail,
}: {
  kind: WorkKind;
  status: string;
  detail?: string;
}) {
  const { label, icon: Icon } = kinds[kind];
  const complete = status === 'completed' || status === 'succeeded';
  const running = [
    'running',
    'working',
    'busy',
    'starting',
    'executing',
    'recovering',
    'resume_requested',
    'stopping',
    'cancelling',
    'cancellation_requested',
  ].includes(status);
  const held = ['paused', 'pause_requested', 'stopped'].includes(status);
  const failed = ['failed', 'error', 'denied', 'interrupted'].includes(status);
  const uncertain = [
    'unknown',
    'task_state_uncertain',
    'recovery_required',
    'degraded',
    'expired',
  ].includes(status);
  const waiting = ['input_required', 'waiting_user', 'waiting_permission'].includes(status);
  const cancelled = status === 'cancelled';
  const caption =
    status === 'waiting_permission'
      ? 'Waiting for permission'
      : waiting
        ? 'Waiting for your answer'
        : status.replaceAll('_', ' ');
  const title = `${label}: ${caption}${detail ? ` — ${detail}` : ''}`;
  const Badge = running
    ? LoaderCircleIcon
    : held
      ? PauseIcon
      : failed || uncertain
        ? CircleAlertIcon
        : cancelled
          ? XIcon
          : !complete && status !== 'not_run'
            ? Clock3Icon
            : undefined;
  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      data-slot="work-kind-status"
      data-work-kind={kind}
      data-work-status={status}
      className={cn(
        'inline-flex h-5 w-8 shrink-0 items-center gap-1',
        complete
          ? 'text-success'
          : failed
            ? 'text-destructive'
            : waiting || uncertain
              ? 'text-warning'
              : running
                ? 'text-primary'
                : 'text-muted-foreground',
      )}
    >
      <Icon aria-hidden="true" className="size-4" data-slot="work-kind-icon" />
      {Badge ? (
        <Badge
          aria-hidden="true"
          data-slot="work-status-indicator"
          className={cn('size-3 shrink-0', running && 'animate-spin motion-reduce:animate-none')}
        />
      ) : null}
    </span>
  );
}
