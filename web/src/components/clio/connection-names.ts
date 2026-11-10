import type { StatusTone } from '@/components/clio/primitives/status-indicator';
import type { ConnectionAvailability } from '@/hooks/use-connection-availability';
import { vocab } from '@/lib/brand-vocabulary';

/**
 * An agent's state word (connect-infrastructure "Switch to"): "Live" for the one the
 * app talks to, "Online" for another that answers, "Offline" when it does not. "Ready"
 * belongs to services and models, never to an agent. Other states keep their own word.
 */
export function agentAvailabilityLabel(
  availability: Pick<ConnectionAvailability, 'state' | 'label'>,
  current: boolean,
): string {
  if (availability.state === 'healthy') return current ? 'Live' : 'Online';
  if (availability.state === 'unavailable') return 'Offline';
  return availability.label;
}

/** The dot beside an agent's word: green when it answers, a hollow ring when it does not. */
export const AGENT_AVAILABILITY_TONE: Record<ConnectionAvailability['state'], StatusTone> = {
  healthy: 'success',
  degraded: 'warning',
  unavailable: 'idle',
  checking: 'running',
};

const GENERIC_LABELS = ['this computer', 'this device', 'local'];
const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '::1', '[::1]'];

export interface AgentIdentity {
  /** What the agent is called: the user's name for it, else "CLIO local" or its host name. */
  name: string;
  /** host[:port] from the address. */
  address: string;
  /** Where it runs, for the line under the name: "this computer" or the address. */
  place: string;
  /** Which icon fits: this computer, a bare IP address, or a named host. */
  kind: 'local' | 'ip' | 'host';
}

/** The CLIO menu's two-line identity for an agent: its name and where it runs. */
export function agentIdentity(endpoint: string, label?: string, location?: string): AgentIdentity {
  let hostname = '';
  let address = endpoint;
  try {
    const url = new URL(endpoint);
    hostname = url.hostname.toLowerCase();
    address = url.host;
  } catch {
    // An unparsable address is shown as typed.
  }
  const local = LOOPBACK_HOSTS.includes(hostname);
  const trimmed = label?.trim();
  const lower = trimmed?.toLocaleLowerCase();
  const named =
    trimmed && lower && !GENERIC_LABELS.includes(lower) && lower !== vocab.agent.toLocaleLowerCase()
      ? trimmed
      : undefined;
  const place = cleanConnectionLocation(location);
  const name =
    named ??
    (place && place !== 'Local' ? place : local ? `${vocab.agent} local` : hostname || address);
  return {
    name,
    address,
    place: local ? 'this computer' : address,
    kind: local ? 'local' : /^[\d.]+$|:/u.test(hostname) ? 'ip' : 'host',
  };
}

/** One plain line for a row: the location, plus a user-defined agent name when there is one. */
export function connectionDisplayName(endpoint: string, label?: string, location?: string): string {
  const displayLocation = connectionLocation(endpoint, location);
  const name = connectionAgentName(label, displayLocation);
  return name === vocab.agent ? displayLocation : `${displayLocation} ${name}`;
}

export function connectionAgentName(label: string | undefined, location: string): string {
  const trimmed = label?.trim();
  if (!trimmed) return vocab.agent;
  const locationLower = location.toLocaleLowerCase();
  const labelLower = trimmed.toLocaleLowerCase();
  if (
    ['this computer', 'this device', 'local'].includes(labelLower) ||
    labelLower === locationLower
  ) {
    return vocab.agent;
  }
  const prefix = `${locationLower} `;
  if (labelLower.startsWith(prefix)) {
    return trimmed.slice(location.length).trim() || vocab.agent;
  }
  return trimmed;
}

export function connectionLocation(endpoint: string, label?: string): string {
  const namedLocation = cleanConnectionLocation(label);
  if (namedLocation) return namedLocation;
  try {
    const hostname = new URL(endpoint).hostname.toLowerCase();
    return ['127.0.0.1', 'localhost', '::1'].includes(hostname) ? 'Local' : hostname || 'Remote';
  } catch {
    return 'Connected';
  }
}

function cleanConnectionLocation(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const lower = trimmed.toLocaleLowerCase();
  if (['this computer', 'this device', 'local'].includes(lower)) return 'Local';
  const agent = vocab.agent.trim();
  const agentLower = agent.toLocaleLowerCase();
  if (lower === agentLower) return undefined;
  if (lower.endsWith(` ${agentLower}`)) {
    return trimmed.slice(0, -(agent.length + 1)).trim() || undefined;
  }
  return tunnelStyleName(trimmed) ?? trimmed;
}

function tunnelStyleName(value: string): string | undefined {
  if (!/^[a-z0-9_-]+$/u.test(value) || /^\d+(?:\.\d+){3}$/u.test(value)) return undefined;
  const words = value.replace(/[_-]+/gu, ' ');
  return words.charAt(0).toLocaleUpperCase() + words.slice(1);
}
