import type { SshHost } from '@/lib/ssh-hosts';

/** One step of an SSH jump chain: a stable drag identity plus its OpenSSH destination. */
export type JumpStep = { key: string; host: string };

let nextJumpKey = 0;

/** A drag identity that never collides with any other step, even for a repeated destination. */
export function newJumpKey(): string {
  nextJumpKey += 1;
  return `ssh-jump-${nextJumpKey}`;
}

/**
 * Re-attach stable drag identities to an ordered jump chain.
 *
 * Each destination reuses the first unclaimed identity it had before, so a
 * reorder keeps every row's identity (what dnd-kit animates) instead of
 * re-keying rows by position; new destinations get fresh identities.
 */
export function reconcileJumpSteps(previous: readonly JumpStep[], hosts: readonly string[]): JumpStep[] {
  const unclaimed = [...previous];
  return hosts.map((host) => {
    const index = unclaimed.findIndex((step) => step.host === host);
    if (index < 0) return { key: newJumpKey(), host };
    const [step] = unclaimed.splice(index, 1);
    return step;
  });
}

/**
 * Why a typed jump host cannot be used, or undefined when it can. Mirrors the
 * desktop's check: whitespace or a comma would corrupt the shared OpenSSH
 * configuration or split one step into two.
 */
export function jumpHostError(destination: string): string | undefined {
  if (!destination) return undefined;
  return /^[A-Za-z0-9._\-@:[\]%]+$/u.test(destination)
    ? undefined
    : 'Use an OpenSSH alias or user@host[:port], without spaces or commas.';
}

/** Parse a free-form `user@host:port` (or `user@[ipv6]:port`) jump destination. */
export function parseJumpDestination(destination: string): Pick<SshHost, 'host' | 'user' | 'port'> {
  const trimmed = destination.trim();
  const at = trimmed.lastIndexOf('@');
  const user = at > 0 ? trimmed.slice(0, at) : undefined;
  const rest = at > 0 ? trimmed.slice(at + 1) : trimmed;
  const bracketed = /^\[([^\]]+)\](?::(\d{1,5}))?$/u.exec(rest);
  if (bracketed) return { host: bracketed[1], user, port: validPort(bracketed[2]) };
  // A bare IPv6 address has several colons and no port.
  const hostPort = rest.split(':').length === 2 ? /^(.*):(\d{1,5})$/u.exec(rest) : null;
  return { host: hostPort ? hostPort[1] : rest, user, port: validPort(hostPort?.[2]) };
}

function validPort(value: string | undefined): number {
  const port = Number(value ?? 22);
  return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : 22;
}

/**
 * An OpenSSH alias for a new CLIO computer that never collides with an
 * existing alias. CLIO's include file is read first, so reusing a name would
 * silently override the user's own `Host` entry of that name.
 */
export function uniqueProfileName(label: string, host: string, taken: readonly string[]): string {
  const source = label.trim() || host.trim();
  const base =
    source
      .normalize('NFKD')
      .replace(/[^A-Za-z0-9._-]+/gu, '-')
      .replace(/^-+|-+$/gu, '')
      .toLocaleLowerCase() || 'clio-host';
  const used = new Set(taken.map((name) => name.toLocaleLowerCase()));
  if (!used.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}
