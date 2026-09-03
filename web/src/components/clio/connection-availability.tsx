import { ServerIcon } from 'lucide-react';
import { ClioStatus, type ClioStatusValue } from '@/components/clio/status';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import type { ConnectionAvailability } from '@/hooks/use-connection-availability';
import { cn } from '@/lib/utils';

interface ConnectionAvailabilityIndicatorProps {
  availability: ConnectionAvailability;
  endpoint: string;
  compact?: boolean;
  className?: string;
}

/** Show a service's reachability inline, with diagnostic detail on hover or focus. */
export function ConnectionAvailabilityIndicator({
  availability,
  endpoint,
  compact = false,
  className,
}: ConnectionAvailabilityIndicatorProps) {
  const value: ClioStatusValue =
    availability.state === 'checking' ? 'connecting' : availability.state;

  return (
    <HoverCard closeDelay={100} openDelay={150}>
      <HoverCardTrigger asChild>
        <span
          className={cn('inline-flex rounded-md outline-none focus-visible:ring-2', className)}
          tabIndex={0}
        >
          <ClioStatus
            className={cn(compact && 'border-0 bg-transparent px-1 py-0 shadow-none')}
            detail={availability.detail}
            label={availability.label}
            value={value}
          />
        </span>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="w-72">
        <div className="flex items-start gap-2.5">
          <ServerIcon aria-hidden="true" className="mt-0.5 text-muted-foreground" />
          <div className="min-w-0">
            <p className="font-medium">{availability.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{availability.detail}</p>
            <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">{endpoint}</p>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
