import { agentIdentity } from './connection-names';

/** "CLIO local @ this computer": the agent's name and where it runs; the "@" is decoration. */
export function AgentConnectionIdentity({
  endpoint,
  label,
  location,
}: {
  endpoint: string;
  label?: string;
  location?: string;
}) {
  const { name, place } = agentIdentity(endpoint, label, location);
  return (
    <span className="flex min-w-0 items-baseline gap-[5px]" title={`${name}, ${place}`}>
      <span className="max-w-[60%] shrink-0 truncate">{name}</span>
      <span aria-hidden="true" className="shrink-0 text-faint">
        @
      </span>
      <span className="min-w-0 truncate">{place}</span>
    </span>
  );
}
