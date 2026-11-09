import { agentIdentity } from './connection-names';

/** "CLIO local · this computer": the agent's name and where it runs, as the CLIO menu header shows them. */
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
  return <span className="block truncate">{`${name} · ${place}`}</span>;
}
