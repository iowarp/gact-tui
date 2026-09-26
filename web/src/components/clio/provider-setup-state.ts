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

/** The one plain sentence a not-ready provider shows: its reason, or what to do. */
export function providerSetupSentence(group: ProviderGroup, flow: ProviderActionFlow): string {
  if (group.setupNeed === 'start') return `${group.name} isn't running. Start it, then check again.`;
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
        (failed ? `${group.name} isn't responding right now.` : `${group.name} hasn't been checked yet.`)
      );
  }
}

/** The latest action's failure as one plain sentence, or nothing. */
export function providerActionError(actions: ProviderActions, providerLabel: string): string | undefined {
  const rejected =
    actions.handshakeResult?.error && ['rejected', 'deferred'].includes(actions.handshakeResult.auth)
      ? translateKnownProviderErrorReason(actions.handshakeResult.error, providerLabel)
      : undefined;
  const refreshFailure = actions.refreshResult?.failed_reason
    ? translateKnownProviderErrorReason(actions.refreshResult.failed_reason, providerLabel)
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

