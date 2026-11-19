import { HourglassIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PluginTabState } from '@/lib/a2ui/plugin-tab-store';
import { CloseIcon, RetryIcon } from '@/lib/icon-vocabulary';
import { StateView } from './primitives/state-view';
import { ph, t } from '@lingui/core/macro';

interface PluginOpenWaitingProps {
  label: string;
  state: PluginTabState | undefined;
  onCancel: () => void;
  onRetry: () => void;
}

/**
 * A plugin tab's or page's body while its open is unanswered or was given up:
 * a long wait never holds the person, so it offers Cancel and Retry. Nothing
 * when the open is still young or it answered.
 */
export function PluginOpenWaitingState({
  label,
  state,
  onCancel,
  onRetry,
}: PluginOpenWaitingProps) {
  if (state?.status === 'cancelled')
    return (
      <StateView
        action={{ label: t`Retry`, icon: <RetryIcon />, onClick: onRetry }}
        kind="unavailable"
        size="viewer"
        title={t`Stopped waiting for ${ph({ label })}`}
      />
    );
  if (state?.status !== 'loading' || !state.stillWaiting) return null;
  return (
    <StateView
      action={{ label: t`Retry`, icon: <RetryIcon />, onClick: onRetry }}
      detail={t`Its server has not answered yet. A first start can take a few minutes.`}
      icon={HourglassIcon}
      kind="empty"
      secondaryAction={{ label: t`Cancel`, icon: <CloseIcon />, onClick: onCancel }}
      size="viewer"
      title={t`Still waiting for ${ph({ label })}`}
    />
  );
}

/**
 * The same choice in one line above a view that is already showing, while
 * it is read again and the read goes unanswered.
 */
export function PluginOpenWaitingLine({ label, state, onCancel, onRetry }: PluginOpenWaitingProps) {
  if (state?.status !== 'loading' || !state.stillWaiting) return null;
  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
      data-slot="plugin-open-waiting"
      role="status"
    >
      <HourglassIcon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="min-w-0 grow basis-40">{t`Still waiting for ${ph({ label })} to answer.`}</span>
      <span className="flex shrink-0 items-center gap-1.5">
        <Button
          className="rounded-[7px] border-input text-foreground"
          onClick={onCancel}
          size="xs"
          variant="outline"
        >
          {t`Cancel`}
        </Button>
        <Button
          className="rounded-[7px] border-input text-foreground"
          onClick={onRetry}
          size="xs"
          variant="outline"
        >
          <RetryIcon aria-hidden="true" className="size-3.5" />
          {t`Retry`}
        </Button>
      </span>
    </div>
  );
}
