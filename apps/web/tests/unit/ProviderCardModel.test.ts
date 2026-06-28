import type { ProviderDef } from '@clio/core';
import { describe, expect, it } from 'vitest';
import {
  providerAuthMethodsLabel,
  providerAuthStatus,
  providerNeedsAuth,
  providerUseLabel,
} from '../../src/routes/discovery/ProviderCardModel.js';

const oauthProvider = {
  id: 'argonne',
  name: 'Argonne Sophia',
  auth_methods: ['oauth', 'api_key'],
  is_authenticated: true,
} as ProviderDef;

describe('ProviderCardModel', () => {
  it('describes authenticated and unauthenticated provider tags', () => {
    expect(providerAuthStatus(oauthProvider)).toEqual({
      label: 'authenticated',
      className: 'dp__tag dp__tag--ok',
    });
    expect(providerAuthStatus({ ...oauthProvider, is_authenticated: false })).toEqual({
      label: 'not authed',
      className: 'dp__tag dp__tag--warn',
    });
  });

  it('detects providers that can re-authenticate through oauth', () => {
    expect(providerNeedsAuth(oauthProvider)).toBe(true);
    expect(providerNeedsAuth({ ...oauthProvider, auth_methods: ['api_key'] })).toBe(false);
    expect(providerNeedsAuth({ ...oauthProvider, auth_methods: undefined })).toBe(false);
  });

  it('labels the primary provider action from active and busy state', () => {
    expect(providerUseLabel(true, true)).toBe('in use');
    expect(providerUseLabel(false, true)).toBe('switching…');
    expect(providerUseLabel(false, false)).toBe('Use as LM');
  });

  it('formats provider auth methods for display', () => {
    expect(providerAuthMethodsLabel(oauthProvider)).toBe('oauth · api_key');
    expect(providerAuthMethodsLabel({ ...oauthProvider, auth_methods: undefined })).toBe('');
  });
});
