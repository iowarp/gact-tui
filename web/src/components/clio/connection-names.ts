import { vocab } from '@/lib/brand-vocabulary';

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
