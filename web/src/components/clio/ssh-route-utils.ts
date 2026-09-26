import { sshHostDestination, type SshHost } from '@/lib/ssh-hosts';

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
export function reconcileJumpSteps(
  previous: readonly JumpStep[],
  hosts: readonly string[],
): JumpStep[] {
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
 * desktop's check: any OpenSSH destination form is allowed; whitespace, a
 * comma, a quote or `#` would corrupt the shared OpenSSH configuration or
 * split one step into two.
 */
export function jumpHostError(destination: string): string | undefined {
  if (!destination) return undefined;
  // oxlint-disable-next-line no-control-regex -- control characters are exactly what is refused.
  return /[\s,"#\u0000-\u001f]/u.test(destination)
    ? 'Use one OpenSSH destination, without spaces, commas, quotes or #.'
    : undefined;
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
 * The route as one ordered list of hop references: jump hosts, then the
 * destination last. The front-door route has no pinned destination row — only
 * positions — so this is the single place that turns the destination-plus-
 * jumpHosts shape the rest of the app persists into the unified hop order the
 * route editor drags and drops.
 */
export function routeSteps(value: SshHost | undefined): string[] {
  return value ? [...(value.jumpHosts ?? []), sshHostDestination(value)] : [];
}

/**
 * The full connection details for one hop reference: the saved computer it
 * names, or (for a typed OpenSSH alias/address never saved as a computer) a
 * parsed draft with just enough to display and to connect through.
 */
export function resolveRouteHop(ref: string, options: readonly SshHost[]): SshHost {
  const saved = options.find((option) => sshHostDestination(option) === ref);
  if (saved) return saved;
  return { id: `draft:${ref}`, label: ref, jumpHosts: [], ...parseJumpDestination(ref) };
}

/**
 * Recompute the destination and its jump chain from a reordered or edited hop
 * list. Whichever hop lands last becomes the destination and every other hop
 * becomes a jump-host reference — reordering can move the destination itself,
 * since it is only ever the last position, never a fixed identity.
 */
export function applyRouteOrder(
  refs: readonly string[],
  resolve: (ref: string) => SshHost,
): SshHost | undefined {
  if (!refs.length) return undefined;
  const destination = resolve(refs[refs.length - 1]);
  return { ...destination, jumpHosts: refs.slice(0, -1) };
}

/** The editable rows for a route: its hops, or one empty destination row. */
export function routeSlots(value: SshHost | undefined): string[] {
  const refs = routeSteps(value);
  return refs.length ? refs : [''];
}

/** Rows of a route that are still empty, for validation at deploy time. */
export type SshRouteCompleteness = { emptyRows: number[] };

/** A message for the first empty row, or undefined when the route is complete. */
export function routeIncompleteMessage(route: SshRouteCompleteness): string | undefined {
  if (!route.emptyRows.length) return undefined;
  return `Choose a computer for hop ${route.emptyRows[0] + 1}, or remove it.`;
}

/** Indexes of rows not filled in yet. */
export function emptyRouteRows(slots: readonly string[]): number[] {
  return slots.flatMap((slot, index) => (slot ? [] : [index]));
}

/** The route the rows describe, or undefined while any row is still empty. */
export function routeFromSlots(
  slots: readonly string[],
  resolve: (ref: string) => SshHost,
): SshHost | undefined {
  return emptyRouteRows(slots).length ? undefined : applyRouteOrder(slots, resolve);
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
