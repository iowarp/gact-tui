import type { LanguageModelPreset, ProviderDefinition } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import {
  providerAvailability,
  providerConnectionLabel,
  providerCredentialKind,
  providerCredentialLabel,
  providerCredentialStateLabel,
  providerNeedsReauthentication,
  translateKnownProviderErrorReason,
} from './provider-availability';

const definition: ProviderDefinition = {
  id: 'claude_code',
  name: 'Claude Code',
  auth_methods: ['none'],
  is_authenticated: true,
  metadata: {},
};

const preset: LanguageModelPreset = {
  id: 'claude_code',
  label: 'Claude Code',
  provider: 'claude_code',
  requires_api_key: false,
  is_authenticated: false,
  status: 'unavailable',
  status_message: 'claude CLI not found on PATH',
  supports_live_catalog: false,
  supports_vision: false,
};

describe('providerAvailability', () => {
  it('does not let a coarse no-key auth flag override live provider availability', () => {
    expect(providerAvailability(definition, preset)).toEqual({
      label: 'Unavailable',
      value: 'unavailable',
      detail: 'Claude Code is not installed on the connected agent.',
    });
  });

  it('labels an unchecked local provider without claiming it is ready', () => {
    expect(providerAvailability(undefined, { ...preset, status: 'unknown' })).toMatchObject({
      label: 'Not checked',
      value: 'degraded',
    });
  });

  it('distinguishes a missing provider runtime from account sign-in', () => {
    expect(
      providerAvailability(undefined, {
        ...preset,
        status: 'install_required',
        status_message: 'Claude Code support is not installed on the connected agent.',
      }),
    ).toEqual({
      label: 'Install needed',
      value: 'unavailable',
      detail: 'Claude Code support is not installed on the connected agent.',
    });
  });

  it('does not expose environment variable names as sign-in instructions', () => {
    expect(
      providerAvailability(undefined, {
        ...preset,
        label: 'OpenRouter',
        status: 'missing_key',
        status_message: 'missing OPENROUTER_API_KEY',
      }),
    ).toEqual({
      label: 'API key needed',
      value: 'unavailable',
      detail: 'Add your OpenRouter API key.',
    });
  });

  it('never repeats "API" when the provider label already ends in it', () => {
    expect(
      providerAvailability(undefined, {
        ...preset,
        label: 'Anthropic API',
        status: 'missing_key',
        status_message: 'missing ANTHROPIC_API_KEY',
      }),
    ).toMatchObject({ detail: 'Add your Anthropic API key.' });
  });

  it('translates the generic connectivity/auth failure instead of the raw backend sentence', () => {
    expect(
      providerAvailability(undefined, {
        ...preset,
        label: 'ALCF',
        status: 'unavailable',
        status_message: 'provider connectivity or authentication check failed',
      }),
    ).toMatchObject({ detail: "Couldn't reach ALCF or confirm your sign-in." });
  });

  it('translates the raw "no Globus token stored" sign-in message', () => {
    expect(
      providerAvailability(undefined, {
        ...preset,
        label: 'ALCF',
        status: 'auth_required',
        status_message: 'no Globus token stored; authenticate ALCF before connecting',
      }),
    ).toMatchObject({ detail: 'Sign in to ALCF to use its models.' });
  });
});

describe('translateKnownProviderErrorReason', () => {
  it('gives the reauth-required reason its own plain wording, never the raw Globus text', () => {
    expect(
      translateKnownProviderErrorReason(
        'argonne_reauthentication_required: Error: Permission denied from internal policies.',
      ),
    ).toBe('Your ALCF session needs to be verified again. Sign in again to continue.');
  });

  it('drops any other typed "snake_case_code: " prefix, keeping the sentence after it', () => {
    expect(
      translateKnownProviderErrorReason(
        'codex_sdk_signed_out: the Codex SDK/runtime is installed, but no account is signed in',
      ),
    ).toBe('The Codex SDK/runtime is installed, but no account is signed in');
  });

  it('never truncates ordinary prose that merely contains a colon', () => {
    expect(translateKnownProviderErrorReason('note: check your connection')).toBe(
      'Note: check your connection',
    );
    expect(translateKnownProviderErrorReason('Connection refused: timeout')).toBe(
      'Connection refused: timeout',
    );
  });

  it('words a rejected key, never the raw code', () => {
    expect(
      translateKnownProviderErrorReason(
        'api_key_rejected: the provider refused the API key (HTTP 401)',
        'OpenRouter',
      ),
    ).toBe('Your OpenRouter API key was rejected.');
    expect(translateKnownProviderErrorReason('key_check_unavailable: HTTP 503', 'OpenRouter')).toBe(
      "Couldn't confirm your OpenRouter API key right now. Try Verify provider again.",
    );
  });

  it('turns the raw "no API key provided" into the key action', () => {
    expect(translateKnownProviderErrorReason('no API key provided', 'OpenRouter')).toBe(
      'Add your OpenRouter API key.',
    );
  });

  it('never shows a bare reason code on its own', () => {
    expect(translateKnownProviderErrorReason('argonne_login_required', 'ALCF')).toBe(
      'ALCF needs attention. Verify it to try again.',
    );
  });

  it('names the provider in the generic connectivity/auth failure when given one', () => {
    expect(
      translateKnownProviderErrorReason(
        'provider connectivity or authentication check failed',
        'Codex',
      ),
    ).toBe("Couldn't reach Codex or confirm your sign-in.");
  });

  it('falls back to provider-agnostic wording for the same failure with no name in scope', () => {
    expect(
      translateKnownProviderErrorReason('provider connectivity or authentication check failed'),
    ).toBe("Couldn't reach this provider or confirm your sign-in.");
  });

  it('translates the raw ALCF "no Globus token stored" message regardless of a name', () => {
    expect(
      translateKnownProviderErrorReason(
        'no Globus token stored; authenticate ALCF before connecting',
      ),
    ).toBe('Sign in to ALCF to use its models.');
  });
});

describe('credential wording follows the auth method', () => {
  const apiKey = { ...preset, id: 'openrouter', label: 'OpenRouter', provider: 'openai', requires_api_key: true, auth_method: 'api_key', status: 'missing_key' };
  const oauth = { ...preset, id: 'argonne_metis', label: 'ALCF Metis', provider: 'argonne', auth_method: 'oauth', status: 'auth_required' };
  const cli = { ...preset, auth_method: 'subscription', status: 'auth_required' };

  it('names the credential by kind: API key, sign-in, CLI login', () => {
    expect([apiKey, oauth, cli].map(providerCredentialKind)).toEqual(['api_key', 'sign_in', 'cli']);
    expect([apiKey, oauth, cli].map(providerCredentialLabel)).toEqual(['API key', 'Sign-in', 'Sign-in']);
    // Host credential chains (Vertex ADC, AWS) are neither a key nor a sign-in.
    expect(providerCredentialLabel({ ...preset, auth_method: 'none', provider: 'openai' })).toBe('Credentials');
    expect(providerAvailability(undefined, apiKey).label).toBe('API key needed');
    expect(providerAvailability(undefined, oauth).label).toBe('Sign-in needed');
    expect(providerAvailability(undefined, { ...apiKey, status: undefined }).label).toBe('API key needed');
  });

  it('never shows a wire token like "skipped": an unprobed connection is Not checked', () => {
    expect(providerConnectionLabel('skipped')).toBe('Not checked');
    expect(providerConnectionLabel(undefined)).toBe('Not checked');
    expect(providerConnectionLabel('ok')).toBe('Reachable');
    expect(providerConnectionLabel('unreachable')).toBe('Unreachable');
  });

  it('states the credential verdict in its own terms', () => {
    expect(providerCredentialStateLabel(apiKey, 'ok')).toBe('Accepted');
    expect(providerCredentialStateLabel(oauth, 'ok')).toBe('Signed in');
    expect(providerCredentialStateLabel(apiKey, 'missing')).toBe('Missing');
    expect(providerCredentialStateLabel(apiKey, 'rejected')).toBe('Rejected');
    expect(providerCredentialStateLabel(oauth, 'deferred')).toBe('Saved, not verified');
  });
});

describe('providerNeedsReauthentication', () => {
  it('reads the typed reason from the preset status or the catalog failure', () => {
    expect(
      providerNeedsReauthentication(
        { status_message: 'argonne_reauthentication_required: timeout' } as LanguageModelPreset,
        undefined,
      ),
    ).toBe(true);
    expect(
      providerNeedsReauthentication(undefined, 'argonne_reauthentication_required: not active'),
    ).toBe(true);
  });

  it('is false for other failures', () => {
    expect(providerNeedsReauthentication(undefined, 'api_key_rejected: 401')).toBe(false);
    expect(providerNeedsReauthentication(undefined, undefined)).toBe(false);
  });
});
