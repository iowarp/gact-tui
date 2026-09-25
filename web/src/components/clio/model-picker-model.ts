import type { LanguageModelPreset, ProviderCatalogTransport } from '@clio/core/v3';
import type { ClioModelOption } from '@/lib/model-options';

export const HIDDEN_PROVIDERS_STORAGE_KEY = 'clio.hidden-providers.v1';
export const PROVIDER_NODE_PREFIX = 'provider:';
export const MODEL_NODE_PREFIX = 'model:';

export type ProviderHealth = 'healthy' | 'degraded' | 'unavailable';

export interface ProviderGroup {
  id: string;
  name: string;
  choices: ClioModelOption[];
  availableChoices: ClioModelOption[];
  endpoint?: string;
  freshness?: string;
  health: ProviderHealth;
  detail?: string;
  /** This provider's own transports (Codex: sdk + direct) -- absent for
   * every single-transport provider. See `ProviderCatalogTransport`. */
  transports?: readonly ProviderCatalogTransport[];
}

export interface ProviderNodeData {
  kind: 'provider';
  group: ProviderGroup;
}

export interface ModelNodeData {
  kind: 'model';
  choice: ClioModelOption;
}

/** A non-selectable section label inside a multi-transport provider's model
 * column (e.g. "Codex (local)" above the SDK's models) -- never a `model` or
 * `provider` row, so `selectable`/click/search treat it as inert. */
export interface TransportHeadingNodeData {
  kind: 'transport-heading';
  label: string;
}

export type PickerNodeData = ProviderNodeData | ModelNodeData | TransportHeadingNodeData;

export function providerHealthPresentation(health: ProviderHealth): {
  color: string;
  label: string;
} {
  return {
    healthy: { color: 'text-success', label: 'Ready' },
    degraded: { color: 'text-warning', label: 'Needs attention' },
    unavailable: { color: 'text-muted-foreground/55', label: 'Unavailable' },
  }[health];
}

export function toProviderGroup(group: {
  id: string;
  name: string;
  choices: ClioModelOption[];
}): ProviderGroup {
  // A provider row stands for the provider itself, so it can never become a
  // model someone picks.
  const availableChoices = group.choices.filter(
    (choice) => choice.available && choice.kind !== 'provider',
  );
  const reportedHealth = group.choices.find((choice) => choice.health)?.health?.toLowerCase();
  const health: ProviderHealth = availableChoices.length
    ? reportedHealth === 'degraded' || reportedHealth === 'error'
      ? 'degraded'
      : 'healthy'
    : reportedHealth === 'degraded' || reportedHealth === 'error'
      ? 'degraded'
      : 'unavailable';
  const details = [
    ...new Set(
      group.choices
        .map((choice) => choice.availabilityDetail)
        .filter((detail): detail is string => Boolean(detail)),
    ),
  ];
  return {
    ...group,
    availableChoices,
    endpoint: group.choices.find((choice) => choice.endpoint)?.endpoint,
    freshness: group.choices.find((choice) => choice.freshness)?.freshness,
    health,
    detail: details[0],
    transports: group.choices.find((choice) => choice.transports)?.transports,
  };
}

/**
 * A preset scoped to one of its own `transports` -- same identity (id,
 * provider, api_base: the mutations are still preset-level; there is no
 * per-transport auth endpoint yet), but with `label`/auth fields overridden
 * by that transport's own reported health, so `ProviderActionPanel` renders
 * THAT transport's action instead of the preset's overall one.
 *
 * `transport.health` -- not a nonexistent per-transport `is_authenticated` --
 * is the wire's own source for this: `"ready"` means authenticated,
 * `"needs_install"` maps to the picker's `install_required` status, anything
 * else falls through to `auth_method`'s normal sign-in derivation. Only the
 * DIRECT transport carries `auth` at all (its real, CLIO-driven OAuth flow);
 * a transport with no `auth` (the SDK, signed in through the Codex CLI
 * itself) is rendered as plain status text by the caller, never a button
 * for an action CLIO cannot actually perform.
 */
export function transportScopedPreset(
  preset: LanguageModelPreset,
  transport: ProviderCatalogTransport,
): LanguageModelPreset {
  return {
    ...preset,
    label: transport.label,
    is_authenticated: transport.health === 'ready',
    auth_method: transport.auth?.method ?? preset.auth_method,
    status: transport.health === 'needs_install' ? 'install_required' : preset.status,
    status_message: transport.reason || preset.status_message,
  };
}

/** Whether `group` has at least one available model that came from `transportId`. */
export function transportHasModels(group: ProviderGroup, transportId: string): boolean {
  return group.availableChoices.some((choice) => choice.transport === transportId);
}

export function providerNodeValue(providerId: string): string {
  return `${PROVIDER_NODE_PREFIX}${providerId}`;
}

export function transportHeadingNodeValue(providerId: string, transportId: string): string {
  return `transport-heading:${providerId}:${transportId}`;
}

export function modelNodeValue(choice: ClioModelOption): string {
  return `${MODEL_NODE_PREFIX}${choice.providerId}:${choice.id}`;
}

export function providerSearchDescription(group: ProviderGroup): string {
  if (group.health === 'unavailable') return 'Unavailable';
  const count = group.availableChoices.length;
  return `${count} ${count === 1 ? 'model' : 'models'}`;
}

export function formatFreshness(freshness: string): string {
  const parsed = new Date(freshness);
  return Number.isNaN(parsed.getTime()) ? freshness : parsed.toLocaleString();
}

export function readHiddenProviders(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const value = JSON.parse(window.localStorage.getItem(HIDDEN_PROVIDERS_STORAGE_KEY) ?? '[]');
    return new Set(Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

export function persistHiddenProviders(providerIds: Set<string>): void {
  try {
    window.localStorage.setItem(
      HIDDEN_PROVIDERS_STORAGE_KEY,
      JSON.stringify([...providerIds].sort()),
    );
  } catch {
    // Storage can be full or blocked outright (private windows, a locked-down
    // profile). Hiding a provider is a convenience for this tab; losing it
    // across reloads is not worth taking the picker down with an exception,
    // and the reader is guarded the same way.
  }
}
