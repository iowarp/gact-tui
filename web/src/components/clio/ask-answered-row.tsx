import type { ComponentProps, ReactNode } from 'react';
import { MinusIcon, OctagonMinusIcon, type LucideIcon } from 'lucide-react';
import { ActivityDisclosure, ActivityRow } from './activity-row';
import { StatusIndicator } from './primitives/status-indicator';

const ANSWERED_STATUS = {
  ok: { tone: 'success', label: 'Done' },
  denied: { tone: 'stopped', label: 'Denied' },
  neutral: { tone: 'inactive', label: 'Closed' },
} as const;

/**
 * Once answered, the card folds into one activity row: chevron, icon, verb,
 * detail and outcome, then the transcript's fixed columns (hover copy and open,
 * status, ⓘ), so it lines up with the tool rows around it.
 */
export function AskAnsweredRow({
  icon: Icon,
  verb,
  detail,
  mono,
  outcome,
  tone = 'ok',
  title,
  open,
  onOpenChange,
  actions,
  info,
  ...props
}: Omit<ComponentProps<'div'>, 'children' | 'title'> & {
  icon: LucideIcon;
  verb: string;
  detail?: ReactNode;
  mono?: boolean;
  /** Who decided, beside the detail ("you denied it"); warning-toned when denied. */
  outcome?: string;
  tone?: 'ok' | 'denied' | 'neutral';
  /** The full detail on hover when it is cut. */
  title?: string;
  /** With `onOpenChange`, the chevron opens what was decided under the row. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Hover actions: copy, and open in the right pocket (`data-activity-action`). */
  actions?: ReactNode;
  /** The ⓘ (ActivityInfoButton); the column stays when absent. */
  info?: ReactNode;
}) {
  const status = ANSWERED_STATUS[tone];
  return (
    <ActivityRow
      data-answered={tone}
      disclosure={
        onOpenChange ? (
          <ActivityDisclosure
            label={`${open ? 'Collapse' : 'Expand'} ${verb}`}
            onClick={() => onOpenChange(!open)}
            open={Boolean(open)}
          />
        ) : null
      }
      icon={<Icon aria-hidden="true" />}
      name={verb}
      argument={detail}
      argumentStyle={mono ? 'code' : 'text'}
      argumentTitle={title}
      outcome={outcome}
      outcomeTone={tone === 'denied' ? 'warning' : 'muted'}
      actions={actions}
      status={
        <StatusIndicator
          display="column"
          icon={
            tone === 'neutral' ? (
              <MinusIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
            ) : tone === 'denied' ? (
              <OctagonMinusIcon aria-hidden="true" className="size-3.5 text-warning" />
            ) : undefined
          }
          label={status.label}
          mark="glyph"
          tone={status.tone}
        />
      }
      info={info}
      open={open}
      onOpenChange={onOpenChange}
      {...props}
    />
  );
}
