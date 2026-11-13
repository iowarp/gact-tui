import { ServerIcon } from 'lucide-react';
import { StatusIndicator } from '@/components/clio/primitives/status-indicator';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import type { ConnectionAvailability } from '@/hooks/use-connection-availability';
import { cn } from '@/lib/utils';
import { AGENT_AVAILABILITY_TONE } from './connection-names';
import { t } from '@lingui/core/macro';

interface ConnectionAvailabilityIndicatorProps {
  availability: ConnectionAvailability;
  endpoint: string;
  compact?: boolean;
  className?: string;
}

/**
 * An agent's reachability as the spec's status dot and word (connect-infrastructure
 * `.st3`), with diagnostic detail on hover or focus.
 */
export function ConnectionAvailabilityIndicator({
  availability,
  endpoint,
  compact = false,
  className,
}: ConnectionAvailabilityIndicatorProps) {
  return (
    <HoverCard closeDelay={100} openDelay={150}>
      <HoverCardTrigger asChild>
        <span
          className={cn('inline-flex rounded-md outline-none focus-visible:ring-2', className)}
          tabIndex={compact ? -1 : 0}
        >
          <StatusIndicator
            className={cn(
              compact && 'text-caption group-data-selected/list-row:text-accent-foreground',
            )}
            label={availability.label}
            tone={AGENT_AVAILABILITY_TONE[availability.state]}
          />
        </span>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="w-72">
        <div className="flex items-start gap-2.5">
          <ServerIcon aria-hidden="true" className="mt-0.5 text-muted-foreground" />
          <div className="min-w-0">
            <p className="font-medium">{availability.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{availability.detail}</p>
            <p className="mt-2 break-all font-mono text-caption text-muted-foreground">{endpoint}</p>
            {availability.diagnostics ? (
              <details className="mt-2 text-xs">
                <summary>{t`Diagnostic details`}</summary>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap">
                  {availability.diagnostics}
                </pre>
              </details>
            ) : null}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
