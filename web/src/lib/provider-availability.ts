import type { LanguageModelPreset, ProviderDefinition } from '@clio/core/v3';

export interface ProviderAvailability {
  label: string;
  value: 'healthy' | 'degraded' | 'unavailable';
  detail?: string;
}

function providerName(preset: LanguageModelPreset | undefined): string {
  return preset?.label.replace(/\s*\([^)]*\)\s*$/u, '') || 'this provider';
}

/** `providerName`, minus a redundant trailing "API" -- a label already shaped
 * like "OpenAI API" would otherwise read "OpenAI API API key". */
function providerNameForApiKeyCopy(preset: LanguageModelPreset | undefined): string {
  return providerName(preset).replace(/\s+API$/u, '');
}

/**
 * Translate a handful of typed backend reasons into plain wording -- never
 * the raw Globus/CLI text a live check surfaced. Applies wherever a reason
 * string can land, not only where a preset is in scope (e.g. a bare
 * handshake or per-transport result) -- `providerName` is optional and only
 * sharpens the generic connectivity/auth sentence when the caller has one.
 */
export function translateKnownProviderErrorReason(text: string, providerLabel?: string): string {
  if (/^argonne_reauthentication_required\b/iu.test(text)) {
    return 'Your ALCF session needs to be verified again. Sign in again to continue.';
  }
  if (/^no Globus token stored/iu.test(text)) {
    return 'Sign in to ALCF to use its models.';
  }
  if (/^api_key_rejected\b/iu.test(text)) {
    return providerLabel
      ? `Your ${providerLabel} API key was rejected.`
      : 'The API key was rejected.';
  }
  if (/^key_check_unavailable\b/iu.test(text)) {
    return providerLabel
      ? `Couldn't confirm your ${providerLabel} API key right now. Try Verify provider again.`
      : "Couldn't confirm the API key right now. Try Verify provider again.";
  }
  if (/^no API key provided$/iu.test(text)) {
    return providerLabel ? `Add your ${providerLabel} API key.` : 'Add an API key.';
  }
  if (/^provider connectivity or authentication check failed$/iu.test(text)) {
    return providerLabel
      ? `Couldn't reach ${providerLabel} or confirm your sign-in.`
      : "Couldn't reach this provider or confirm your sign-in.";
  }
  // Every other typed reason this build knows about already reads as a plain
  // sentence after its "snake_case_code: " prefix (the
  // `SDK_UNAVAILABLE_REASONS`/`PASSIVE_TOKEN_REASONS` style) -- drop just the
  // code, never inventing new wording for a reason this build has never seen.
  // Requires an underscore before the colon (every real typed code has one,
  // e.g. `codex_sdk_signed_out`), so an ordinary "note: ..." sentence a
  // caller passes as free text is never mistaken for a code and truncated.
  // A bare code with no sentence after it is never shown as is.
  if (/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/u.test(text.trim())) {
    return `${providerLabel ?? 'This provider'} needs attention. Verify it to try again.`;
  }
  const sentence = text.replace(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+:\s*/u, '');
  // Sentence case: the reason follows the code in lower case on the wire.
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/** Translate service configuration diagnostics into useful product language. */
export function providerStatusDetail(
  preset: LanguageModelPreset | undefined,
  fallback?: string,
): string | undefined {
  const detail = preset?.status_message || fallback;
  if (!detail) return undefined;
  if (/^missing\s+[A-Z0-9_]+_API_KEY$/u.test(detail)) {
    return `Add your ${providerNameForApiKeyCopy(preset)} API key.`;
  }
  if (/stored Globus token could not be refreshed/iu.test(detail)) {
    return 'Sign in to your ALCF account again.';
  }
  if (/(?:CLI|command).*(?:not found|not installed)|not found on PATH/iu.test(detail)) {
    return `${providerName(preset)} is not installed on the connected agent.`;
  }
  return translateKnownProviderErrorReason(detail, providerName(preset));
}

/** Prefer the live preset status over a provider's coarse authentication capability. */
export function providerAvailability(
  provider: ProviderDefinition | undefined,
  preset: LanguageModelPreset | undefined,
): ProviderAvailability {
  if (preset?.status === 'ready') return { label: 'Ready', value: 'healthy' };
  if (preset?.status === 'unknown') {
    return {
      label: 'Not checked',
      value: 'degraded',
      detail: providerStatusDetail(preset, 'Run a provider check to verify availability.'),
    };
  }
  if (preset?.status === 'auth_check_required') {
    return {
      label: 'Not checked',
      value: 'degraded',
      detail: providerStatusDetail(preset, 'Run a provider check to verify sign-in.'),
    };
  }
  if (preset?.status === 'install_required') {
    return {
      label: 'Install needed',
      value: 'unavailable',
      detail: providerStatusDetail(preset, `${providerName(preset)} is not installed.`),
    };
  }
  if (preset?.status === 'unavailable') {
    return {
      label: 'Unavailable',
      value: 'unavailable',
      detail: providerStatusDetail(preset),
    };
  }
  if (preset?.status === 'missing_key' || preset?.status === 'auth_required') {
    return {
      label: providerCredentialNeededLabel(preset),
      value: 'unavailable',
      detail: providerStatusDetail(preset),
    };
  }
  if (preset?.is_authenticated) return { label: 'Ready', value: 'healthy' };
  if (preset) {
    return {
      label: providerCredentialNeededLabel(preset),
      value: 'unavailable',
      detail: providerStatusDetail(preset),
    };
  }
  return provider?.is_authenticated
    ? { label: 'Ready', value: 'healthy' }
    : { label: 'Sign-in needed', value: 'unavailable' };
}

/** Which single blocking action a preset needs before its models are usable. */
export type ProviderPrimaryAction = 'sign_in' | 'install' | 'api_key' | 'none';

export function providerPrimaryAction(preset: LanguageModelPreset | undefined): ProviderPrimaryAction {
  if (!preset) return 'none';
  if (preset.status === 'install_required') return 'install';
  if (!preset.is_authenticated && (preset.auth_method === 'oauth' || preset.auth_method === 'subscription'))
    return 'sign_in';
  if (preset.requires_api_key && !preset.is_authenticated) return 'api_key';
  return 'none';
}

/**
 * How a provider is authorised, from its auth method -- the ONE source of
 * every "API key" vs "sign-in" word on the provider surfaces (Settings >
 * Providers, the model picker, Settings > Models' setup row):
 *
 * - `api_key`: a key the person pastes (OpenRouter, OpenAI, ...);
 * - `sign_in`: a CLIO-driven OAuth/subscription sign-in (ALCF, Codex);
 * - `cli`: a login owned by the provider's own CLI on the connected agent
 *   (Claude Code) -- CLIO can install and check it, the CLI signs in;
 * - `none`: no credential (local runtimes, host credential chains).
 */
export type ProviderCredentialKind = 'api_key' | 'sign_in' | 'cli' | 'none';

export function providerCredentialKind(
  preset: LanguageModelPreset | undefined,
): ProviderCredentialKind {
  if (!preset) return 'none';
  if (preset.requires_api_key || preset.auth_method === 'api_key' || preset.status === 'missing_key')
    return 'api_key';
  if (preset.provider === 'claude_code') return 'cli';
  if (preset.auth_method === 'oauth' || preset.auth_method === 'subscription') return 'sign_in';
  return 'none';
}

/**
 * The credential's own name: "API key", "Sign-in", or "Credentials" for a
 * provider that uses the host's own credential chain (Vertex ADC, AWS).
 */
export function providerCredentialLabel(preset: LanguageModelPreset | undefined): string {
  const kind = providerCredentialKind(preset);
  return kind === 'api_key' ? 'API key' : kind === 'none' ? 'Credentials' : 'Sign-in';
}

/** The state of a provider still missing its credential: "API key needed" / "Sign-in needed". */
export function providerCredentialNeededLabel(preset: LanguageModelPreset | undefined): string {
  return `${providerCredentialLabel(preset)} needed`;
}

/** The fallback reason for a provider missing its credential, in its own terms. */
export function providerCredentialPrompt(
  preset: LanguageModelPreset | undefined,
  providerLabel: string,
): string {
  return providerCredentialKind(preset) === 'api_key'
    ? `Add your ${providerLabel.replace(/\s+API$/u, '')} API key to use its models.`
    : `Sign in to ${providerLabel} to use its models.`;
}

/**
 * What a provider that is not usable yet is waiting for, from its latest
 * reported state: an install, a sign-in, an API key, or a first check --
 * or, for a server on this computer that is not answering, to be started
 * (`start`: not an error; set by the provider-group derivation).
 * `undefined` means nothing is outstanding -- a signed-in, verified
 * provider -- whether or not a model catalog entry exists for it yet.
 */
export type ProviderSetupNeed = 'install' | 'sign_in' | 'api_key' | 'check' | 'start';

export function providerSetupNeed(
  preset: LanguageModelPreset | undefined,
): ProviderSetupNeed | undefined {
  if (!preset) return undefined;
  const action = providerPrimaryAction(preset);
  if (action !== 'none') return action;
  if (!preset.is_authenticated) {
    return providerCredentialKind(preset) === 'api_key' ? 'api_key' : 'sign_in';
  }
  if (preset.status === 'unknown' || preset.status === 'auth_check_required') return 'check';
  return undefined;
}

/** The short state label for each outstanding need. */
export function providerSetupNeedLabel(need: ProviderSetupNeed | undefined): string {
  return need === 'install'
    ? 'Needs install'
    : need === 'sign_in'
      ? 'Needs sign-in'
      : need === 'api_key'
        ? 'Needs API key'
        : need === 'check'
          ? 'Not checked'
          : need === 'start'
            ? 'Not running'
            : 'Needs setup';
}

/**
 * A provider check's reachability (`ConnectivityState` on the wire) as a
 * person reads it. "skipped" is not a result: the service did not probe.
 */
export function providerConnectionLabel(connectivity: string | undefined): string {
  switch (connectivity) {
    case 'ok':
      return 'Reachable';
    case 'unreachable':
      return 'Unreachable';
    case 'timeout':
      return 'Timed out';
    default:
      return 'Not checked';
  }
}

/** A provider check's credential verdict (`AuthState` on the wire) in the credential's own terms. */
export function providerCredentialStateLabel(
  preset: LanguageModelPreset | undefined,
  auth: string | undefined,
): string {
  switch (auth) {
    case 'ok':
      return providerCredentialKind(preset) === 'api_key' ? 'Accepted' : 'Signed in';
    case 'missing':
      return 'Missing';
    case 'rejected':
      return 'Rejected';
    case 'deferred':
      return 'Saved, not verified';
    case 'not_required':
      return 'Not required';
    default:
      return 'Not checked';
  }
}
