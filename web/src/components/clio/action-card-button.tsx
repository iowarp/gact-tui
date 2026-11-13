import type { ActionCardAction } from '@clio/core/v3';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { InfoTip } from './info-tip';
import { t, ph } from '@lingui/core/macro';

/** Unknown or unavailable actions retain an accessible explanation. */
export function ActionCardButton({
  action,
  onAction,
}: {
  action: ActionCardAction;
  onAction?: (action: ActionCardAction) => void | Promise<unknown>;
}) {
  const known = ['focus_session', 'inspect_attention'].includes(action.behavior.kind);
  const disabled = !action.enabled || !onAction || !known;
  const reason = disabled
    ? action.behavior.reason || t`This action is not available in this client.`
    : undefined;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Button
        disabled={disabled}
        onClick={async () => {
          try {
            await onAction?.(action);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : t`Could not open this finding.`);
          }
        }}
        size="sm"
        variant="outline"
      >
        {action.label}
      </Button>
      {reason ? <InfoTip label={t`About ${ph({ label: action.label })}`}>{reason}</InfoTip> : null}
    </span>
  );
}
