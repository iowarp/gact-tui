import { ChevronRightIcon } from 'lucide-react';
import { connectionAgentName, connectionLocation } from './connection-names';

/** "Location › Agent" for a saved connection, as the left bar and the CLIO menu show it. */
export function AgentConnectionIdentity({
  endpoint,
  label,
  location,
}: {
  endpoint: string;
  label?: string;
  location?: string;
}) {
  const displayLocation = connectionLocation(endpoint, location);
  const name = connectionAgentName(label, displayLocation);
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <span className="truncate">{displayLocation}</span>
      <ChevronRightIcon aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
      <span className="shrink-0 font-medium text-foreground">{name}</span>
    </span>
  );
}
