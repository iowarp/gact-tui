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

/** Parse a free-form `user@host:port` jump destination into dialog fields. */
export function parseJumpDestination(destination: string): Pick<SshHost, 'host' | 'user' | 'port'> {
  const trimmed = destination.trim();
  const at = trimmed.lastIndexOf('@');
  const user = at > 0 ? trimmed.slice(0, at) : undefined;
  const rest = at > 0 ? trimmed.slice(at + 1) : trimmed;
  const portMatch = /^(.*):(\d{1,5})$/u.exec(rest);
  const port = portMatch ? Number(portMatch[2]) : 22;
  return {
    host: portMatch ? portMatch[1] : rest,
    user,
    port: port > 0 && port <= 65_535 ? port : 22,
  };
}
