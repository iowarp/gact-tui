import type { ActionCardAction, MessageBlock } from '@clio/core/v3';
import { ShieldAlertIcon, TriangleAlertIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { vocab } from '@/lib/brand-vocabulary';
import { InfoIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { ActionCardButton } from './action-card-button';

type ActionCardBlock = Extract<MessageBlock, { type: 'action_card' }>;

const SEVERITY = {
  critical: { label: 'Critical', accent: 'border-l-destructive', tone: 'text-destructive' },
  warning: { label: 'Warning', accent: 'border-l-warning', tone: 'text-warning' },
  info: { label: 'Info', accent: 'border-l-primary', tone: 'text-primary' },
} as const;

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
  const severity =
    SEVERITY[(block.severity ?? 'warning') as keyof typeof SEVERITY] ?? SEVERITY.warning;
  const Icon =
    block.severity === 'info'
      ? InfoIcon
      : block.severity === 'critical'
        ? ShieldAlertIcon
        : TriangleAlertIcon;
  // The evidence action leads when it is usable; an unavailable one keeps its reason tip.
  const actions = [...block.actions].sort(
    (a, b) =>
      Number(b.enabled && b.behavior.kind === 'inspect_attention') -
      Number(a.enabled && a.behavior.kind === 'inspect_attention'),
  );
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
        <Badge variant={block.severity === 'critical' ? 'destructive' : 'outline'}>
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
