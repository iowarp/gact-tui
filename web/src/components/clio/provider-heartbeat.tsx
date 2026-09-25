import { ActivityIcon } from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { cn } from '@/lib/utils';
import {
  formatFreshness,
  providerGroupStatus,
  providerHealthPresentation,
  type ProviderGroup,
} from './model-picker-model';

/**
 * The provider heartbeat: health colour on EVERY provider row -- the model
 * picker's column, Settings > Providers' list and its panel header -- with
 * its detail in the HoverCard. A running action (`stage`) shows as
 * `checking` (yellow) with its stage as the label until it settles back to
 * the row's real health. One component, so both surfaces read the same.
 */
export function ProviderHeartbeat({ group, stage }: { group: ProviderGroup; stage?: string }) {
  const presentation = stage
    ? { ...providerHealthPresentation('checking'), label: stage }
    : providerGroupStatus(group);
  return (
    <HoverCard openDelay={180}>
      <HoverCardTrigger asChild>
        <span
          aria-label={`${group.name} status: ${presentation.label}`}
          className={cn(
            'pointer-events-auto inline-flex size-6 shrink-0 cursor-help items-center justify-center rounded-md',
            presentation.color,
          )}
          data-slot="provider-heartbeat"
          data-state={stage ? 'checking' : group.health}
          onClick={(event) => event.stopPropagation()}
          role="img"
          title={`${group.name} status: ${presentation.label}`}
        >
          <ActivityIcon aria-hidden="true" className="size-4" />
        </span>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="flex w-72 flex-col gap-1 text-xs">
        <p className="font-medium">Provider status</p>
        <p>Health: {presentation.label}</p>
        <p>Refreshed: {group.freshness ? formatFreshness(group.freshness) : 'Unavailable'}</p>
        {group.endpoint ? <p className="truncate text-muted-foreground">{group.endpoint}</p> : null}
        {group.detail ? <p className="text-muted-foreground">{group.detail}</p> : null}
      </HoverCardContent>
    </HoverCard>
  );
}
