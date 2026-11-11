import type { ActionCardAction, MessageBlock } from '@clio/core/v3';
import { ShieldAlertIcon, TriangleAlertIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { vocab } from '@/lib/brand-vocabulary';
import { cn } from '@/lib/utils';
import { ActionCardButton } from './action-card-button';

type ActionCardBlock = Extract<MessageBlock, { type: 'action_card' }>;

/** Two alert levels: a warning informs (yellow); a danger also quarantines the session (red). */
const LEVEL = {
  warning: {
    label: 'Warning',
    accent: 'border-l-warning',
    tone: 'text-warning',
    Icon: TriangleAlertIcon,
  },
  danger: {
    label: 'Danger',
    accent: 'border-l-destructive',
    tone: 'text-destructive',
    Icon: ShieldAlertIcon,
  },
} as const;

/** Older cards said ``critical`` (a danger) or ``info`` (a warning). */
function alertLevel(severity: string | undefined) {
  return severity === 'danger' || severity === 'critical' ? LEVEL.danger : LEVEL.warning;
}

/** Who raised the card, as the person knows it (the watcher agent id reads as SPOTTER). */
function raisedBy(source: string | undefined): string {
  if (!source) return vocab.agent;
  return /spotter/i.test(source) ? 'SPOTTER' : source;
}

/**
 * A finding raised into this conversation (today: by the SPOTTER watcher). Reads as a
 * review note beside the transcript, not as an error: who raised it and how serious, the
 * finding, its detail, then what the person can do about it.
 */
export function ActionAlertCard({
  block,
  onAction,
}: {
  block: ActionCardBlock;
  onAction?: (action: ActionCardAction) => void | Promise<unknown>;
}) {
  const severity = alertLevel(block.severity);
  const Icon = severity.Icon;
  // Attention is explored by selecting text in the answer now; older cards' evidence action is
  // not offered.
  const actions = block.actions.filter((action) => action.behavior.kind !== 'inspect_attention');
  return (
    <section
      aria-label={`${raisedBy(block.source)} finding: ${block.title}`}
      className={cn('my-2 rounded-lg border border-l-4 bg-card px-4 py-3 text-sm', severity.accent)}
      data-slot="action-alert-card"
      role="alert"
    >
      <header className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <Icon aria-hidden="true" className={cn('size-3.5 shrink-0', severity.tone)} />
        <span className="font-medium tracking-wide text-foreground">{raisedBy(block.source)}</span>
        <Badge variant={severity === LEVEL.danger ? 'destructive' : 'outline'}>
          {severity.label}
        </Badge>
      </header>
      <h3 className="mt-1.5 font-medium text-foreground">{block.title}</h3>
      {block.detail ? (
        // Plain text: a finding quotes formats and data ("<dose>; <verdict>") that a
        // markdown renderer would swallow as HTML.
        <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{block.detail}</p>
      ) : null}
      {actions.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((action) => (
            <ActionCardButton action={action} key={action.id} onAction={onAction} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
