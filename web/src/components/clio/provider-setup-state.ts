import type { LanguageModelPreset } from '@clio/core/v3';
import {
  providerCredentialKind,
  providerNeedsReauthentication,
  providerPrimaryAction,
  translateKnownProviderErrorReason,
} from '@/lib/provider-availability';
import type { ProviderGroup } from './model-picker-model';
import type { ProviderActionFlow } from './provider-action-steps';
import type { useProviderActions } from './provider-actions';

export type ProviderActions = ReturnType<typeof useProviderActions>;

/**
 * The ONE thing a provider that is not usable yet needs, from its latest
 * state: a key, a log in, an install, or a check. A provider whose key was
 * refused still needs a key (a new one), never a "check again".
 */
export function providerSetupFlow(
  group: ProviderGroup,
  preset: LanguageModelPreset | undefined,
): ProviderActionFlow {
  if (providerNeedsReauthentication(preset, group.failure)) return 'sign_in';
  const action = providerPrimaryAction(preset);
  if (action !== 'none') return action;
  if (providerCredentialKind(preset) === 'api_key' && group.health !== 'healthy') return 'api_key';
  return 'check';
}

/** `host:port` of a provider's endpoint, as a person recognises it (or nothing). */
function serverAddress(endpoint: string | undefined): string | undefined {
  if (!endpoint) return undefined;
  try {
    return new URL(endpoint).host || undefined;
  } catch {
    return undefined;
  }
}

/** The one plain sentence a not-ready provider shows: its reason, or what to do. */
export function providerSetupSentence(group: ProviderGroup, flow: ProviderActionFlow): string {
  if (group.setupNeed === 'start') {
    const address = serverAddress(group.endpoint);
    const where = address ? ` at ${address}` : '';
    return `${group.name} isn't running${where}. Start it, then check again.`;
  }
  const failed = group.health === 'degraded' || group.health === 'unavailable';
  if (failed && group.detail) return group.detail;
  const name = group.name.replace(/\s+API$/u, '');
  switch (flow) {
    case 'api_key':
      return `Add your ${name} key to use its models.`;
    case 'sign_in':
      return `Log in to ${group.name} to use its models.`;
    case 'install':
      return `${group.name} isn't installed yet.`;
    default:
      return (
        group.detail ||
        (failed
          ? `${group.name} isn't responding right now.`
          : `${group.name} hasn't been checked yet.`)
      );
  }
}

/**
 * What `providerActionError` needs to know about a provider: its name, and --
 * where a catalog row is at hand (the picker, Settings) -- its latest health
 * and when that was reported. A surface without a catalog row (a failed
 * turn's sign-in card) passes the name alone; nothing then supersedes a failure.
 */
export type ProviderStanding = Pick<ProviderGroup, 'name'> &
  Partial<Pick<ProviderGroup, 'health' | 'freshness'>>;

/**
 * Whether the provider has reported healthy SINCE a check ran: a later
 * catalog read is newer evidence than the check's failure, which then no
 * longer describes the provider (a server that was down and came up).
 */
function supersededByHealthyCatalog(
  group: ProviderStanding,
  checkedAt: string | undefined,
): boolean {
  if (group.health !== 'healthy' || !group.freshness || !checkedAt) return false;
  const reported = Date.parse(group.freshness);
  const checked = Date.parse(checkedAt);
  return Number.isFinite(reported) && Number.isFinite(checked) && reported > checked;
}

/**
 * The latest action's failure for THIS provider as one plain sentence, or
 * nothing. The action hook keeps results per provider, so another provider's
 * failure never reaches here.
 */
export function providerActionError(
  actions: ProviderActions,
  group: ProviderStanding,
): string | undefined {
  const providerLabel = group.name;
  const handshakeResult = actions.handshakeResult;
  const rejected =
    handshakeResult?.error &&
    ['rejected', 'deferred'].includes(handshakeResult.auth) &&
    !supersededByHealthyCatalog(group, handshakeResult.generated_at)
      ? translateKnownProviderErrorReason(handshakeResult.error, providerLabel)
      : undefined;
  const refreshResult = actions.refreshResult;
  const refreshFailure =
    refreshResult?.failed_reason && !supersededByHealthyCatalog(group, refreshResult.generated_at)
      ? translateKnownProviderErrorReason(refreshResult.failed_reason, providerLabel)
      : undefined;
  return (
    actions.saveApiKey.error?.message ??
    actions.installProvider.error?.message ??
    actions.authenticate.error?.message ??
    (actions.authFailedReason || undefined) ??
    actions.handshake.error?.message ??
    rejected ??
    actions.refreshModels.error?.message ??
    refreshFailure ??
    actions.logout.error?.message ??
    actions.removeApiKey.error?.message
  );
}
