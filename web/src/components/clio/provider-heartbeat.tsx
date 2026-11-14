import { memo } from 'react';
import { LazyHoverCard } from './primitives/lazy-hover-card';
import { cn } from '@/lib/utils';
import {
  formatFreshness,
  providerGroupStatus,
  providerHealthPresentation,
  type ProviderGroup,
} from './model-picker-model';
import { providerActionStageLabel } from './provider-actions';
import { t, ph } from '@lingui/core/macro';

/**
 * The provider heartbeat: a health dot on EVERY provider row -- the model
 * picker's column, Settings > Providers' list and its panel header -- with
 * its detail in the HoverCard. A running action (`stage`) shows as
 * `checking` (yellow) with its stage as the label until it settles back to
 * the row's real health. One component, so both surfaces read the same.
 */
// Memoised: picker rows re-render on every keystroke for their counts, while a
// provider's group and stage rarely change; its hover card subtree is skipped.
export const ProviderHeartbeat = memo(function ProviderHeartbeat({
  group,
  stage,
}: {
  group: ProviderGroup;
  stage?: string;
}) {
  const presentation = stage
    ? { ...providerHealthPresentation('checking'), label: providerActionStageLabel(stage) }
    : providerGroupStatus(group);
  const refreshed = group.freshness ? formatFreshness(group.freshness) : t`Unavailable`;
  return (
    <LazyHoverCard
      align="start"
      className="flex w-72 flex-col gap-1 text-xs"
      openDelay={180}
      trigger={
        <span
          aria-label={t`${ph({ name: group.name })} status: ${ph({ status: presentation.label })}`}
          className={cn(
            'pointer-events-auto inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-full',
            presentation.color,
          )}
          data-slot="provider-heartbeat"
          data-state={stage ? 'checking' : group.health}
          onClick={(event) => event.stopPropagation()}
          role="img"
          title={t`${ph({ name: group.name })} status: ${ph({ status: presentation.label })}`}
        >
          <span aria-hidden="true" className="size-[7px] rounded-full bg-current" />
        </span>
      }
    >
      <p className="font-medium">{t`Provider status`}</p>
      <p>{t`Health: ${ph({ status: presentation.label })}`}</p>
      <p>{t`Refreshed: ${ph({ time: refreshed })}`}</p>
      {group.endpoint ? <p className="truncate text-muted-foreground">{group.endpoint}</p> : null}
      {group.detail ? <p className="text-muted-foreground">{group.detail}</p> : null}
    </LazyHoverCard>
  );
});
