/**
 * View-model / pure logic for Provider Card: state shaping and helpers, no DOM. Key export `ProviderAuthStatus`.
 */
import type { ProviderDef } from '@clio/core';

export interface ProviderAuthStatus {
  label: string;
  className: string;
}

export function providerAuthStatus(provider: ProviderDef): ProviderAuthStatus {
  return provider.is_authenticated === true
    ? { label: 'authenticated', className: 'dp__tag dp__tag--ok' }
    : { label: 'not authed', className: 'dp__tag dp__tag--warn' };
}

export function providerNeedsAuth(provider: ProviderDef): boolean {
  return (provider.auth_methods ?? []).some((method) => method === 'oauth');
}

export function providerUseLabel(isActive: boolean, busy: boolean): string {
  if (isActive) return 'in use';
  if (busy) return 'switching…';
  return 'Use as LM';
}

export function providerAuthMethodsLabel(provider: ProviderDef): string {
  return (provider.auth_methods ?? []).join(' · ');
}
