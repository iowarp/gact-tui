import type { LanguageModelPreset, ProviderCatalogTransport } from '@clio/core/v3';
import { type ClioModelOption, PROVIDER_NEEDS_SETUP } from '@/lib/model-options';

export const HIDDEN_PROVIDERS_STORAGE_KEY = 'clio.hidden-providers.v1';
export const PROVIDER_NODE_PREFIX = 'provider:';
export const MODEL_NODE_PREFIX = 'model:';

/**
 * `checking`: a probe is running right now (the service's own background
 * reprobe); `setup`: nothing has failed yet, the provider still needs an
 * install, a sign-in or a key (or was never checked). Every other state
 * settles green (`healthy`) or red (`degraded` / `unavailable`), with the
 * reason in `detail`.
 */
export type ProviderHealth = 'healthy' | 'checking' | 'degraded' | 'unavailable' | 'setup';

/** Sort order of the provider column: usable first, never-checked last. */
export const PROVIDER_HEALTH_ORDER: Record<ProviderHealth, number> = {
  healthy: 0,
  checking: 1,
  degraded: 2,
  unavailable: 3,
  setup: 4,
};

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
    checking: { color: 'text-warning animate-pulse', label: 'Checking…' },
    degraded: { color: 'text-destructive', label: 'Needs attention' },
    unavailable: { color: 'text-destructive', label: 'Unavailable' },
    setup: { color: 'text-muted-foreground/55', label: 'Needs setup' },
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
  const reportedFailure = reportedHealth === 'degraded' || reportedHealth === 'error';
  const health: ProviderHealth =
    !group.choices.length || reportedHealth === PROVIDER_NEEDS_SETUP
      ? 'setup'
      : reportedHealth === 'checking'
        ? 'checking'
        : reportedFailure
          ? 'degraded'
          : availableChoices.length
            ? 'healthy'
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
    supports_logout: transport.auth?.logout === true,
  };
}

/**
 * The ready half of a multi-transport provider as ONE preset: ready, so
 * `ProviderActionPanel` renders Verify provider / Refresh models, and able to
 * sign out only when a READY transport's own `auth.logout` says CLIO can
 * (Codex Direct: yes; the SDK transport is the user's own Codex login) --
 * never the preset-level flag, which cannot tell the two transports apart.
 */
export function readyTransportsPreset(
  preset: LanguageModelPreset,
  transports: readonly ProviderCatalogTransport[],
): LanguageModelPreset {
  return {
    ...preset,
    status: 'ready',
    status_message: undefined,
    is_authenticated: true,
    requires_api_key: false,
    supports_logout: transports.some(
      (transport) => transport.health === 'ready' && transport.auth?.logout === true,
    ),
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

/** A model row's tree identity. Two transports of one provider can report the
 * same model id (Codex SDK and Direct both list `gpt-5.5`), so the transport
 * is part of it -- otherwise the second half's rows collapse into the first. */
export function modelNodeValue(choice: ClioModelOption): string {
  const transport = choice.transport ? `${choice.transport}:` : '';
  return `${MODEL_NODE_PREFIX}${choice.providerId}:${transport}${choice.id}`;
}

export function providerSearchDescription(group: ProviderGroup): string {
  if (group.health === 'unavailable' || group.health === 'setup') {
    return providerHealthPresentation(group.health).label;
  }
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
