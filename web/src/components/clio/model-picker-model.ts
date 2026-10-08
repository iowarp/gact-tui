import type { LanguageModelPreset, ProviderClientFact } from '@clio/core/v3';
import { isLocalServerPreset } from '@/lib/local-servers';
import { type ClioModelOption, PROVIDER_NEEDS_SETUP } from '@/lib/model-options';
import {
  providerSetupNeed,
  providerSetupNeedLabel,
  providerStatusDetail,
  type ProviderSetupNeed,
} from '@/lib/provider-availability';

export const PROVIDER_NODE_PREFIX = 'provider:';
export const MODEL_NODE_PREFIX = 'model:';

/**
 * The heartbeat follows the provider's LATEST check: `checking` while a probe
 * runs (the service's own background reprobe); `setup` while it still needs
 * something -- an install, a sign-in, an API key, or a first check (which one
 * is `ProviderGroup.setupNeed`); otherwise green (`healthy`) or red
 * (`degraded` / `unavailable`) with the reason in `detail`. A provider with
 * no model catalog entry yet is NOT "setup" on that alone: a signed-in,
 * verified provider is `healthy` with zero models.
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
  /** What a `setup` provider is waiting for; absent for every other health. */
  setupNeed?: ProviderSetupNeed;
  detail?: string;
  /** The provider's typed failure reason (untranslated), when it reported one. */
  failure?: string;
  /** The CLI its SDK runs (installed vs bundled), when the provider uses one. */
  client?: ProviderClientFact;
}

export interface ProviderNodeData {
  kind: 'provider';
  group: ProviderGroup;
}

export interface ModelNodeData {
  kind: 'model';
  choice: ClioModelOption;
}

export type PickerNodeData = ProviderNodeData | ModelNodeData;

export function providerHealthPresentation(
  health: ProviderHealth,
  setupNeed?: ProviderSetupNeed,
): {
  color: string;
  label: string;
} {
  return {
    healthy: { color: 'text-success', label: 'Ready' },
    checking: { color: 'text-warning animate-pulse', label: 'Checking…' },
    degraded: { color: 'text-destructive', label: 'Needs attention' },
    unavailable: { color: 'text-destructive', label: 'Unavailable' },
    setup: { color: 'text-muted-foreground/55', label: providerSetupNeedLabel(setupNeed) },
  }[health];
}

/** One provider row's colour and state label ("Ready", "Needs API key", ...). */
export function providerGroupStatus(group: ProviderGroup): { color: string; label: string } {
  return providerHealthPresentation(group.health, group.setupNeed);
}

/**
 * The health of a provider with NO catalog rows at all, from its preset's
 * latest reported state: whatever it still needs, red when the service
 * reported it unavailable, and ready when nothing is outstanding.
 */
function presetOnlyHealth(preset: LanguageModelPreset | undefined): {
  health: ProviderHealth;
  setupNeed?: ProviderSetupNeed;
} {
  if (!preset) return { health: 'setup' };
  const need = providerSetupNeed(preset);
  if (need && need !== 'check') return { health: 'setup', setupNeed: need };
  if (preset.status === 'unavailable') return { health: 'unavailable' };
  if (need) return { health: 'setup', setupNeed: need };
  return { health: 'healthy' };
}

/**
 * A server on this computer that is not answering is waiting to be started,
 * not failing: it reads grey "Not running" (the same derived state Settings >
 * Providers shows), never the red of a real failure.
 */
function localServerNotRunning(
  group: ProviderGroup,
  preset: LanguageModelPreset | undefined,
): ProviderGroup {
  if (!preset || !isLocalServerPreset(preset)) return group;
  if (group.health !== 'unavailable' && group.health !== 'degraded') return group;
  return { ...group, health: 'setup', setupNeed: 'start' };
}

export function toProviderGroup(
  group: {
    id: string;
    name: string;
    choices: ClioModelOption[];
  },
  preset?: LanguageModelPreset,
): ProviderGroup {
  return localServerNotRunning(derivedProviderGroup(group, preset), preset);
}

function derivedProviderGroup(
  group: {
    id: string;
    name: string;
    choices: ClioModelOption[];
  },
  preset?: LanguageModelPreset,
): ProviderGroup {
  // A provider row stands for the provider itself, so it can never become a
  // model someone picks.
  const availableChoices = group.choices.filter(
    (choice) => choice.available && choice.kind !== 'provider',
  );
  const reportedHealth = group.choices.find((choice) => choice.health)?.health?.toLowerCase();
  // The service's latest verdict wins over leftover choices: a provider it
  // reports `unavailable` (e.g. a rejected key, or a failed probe serving a
  // dated last-good list) is red, never green because rows remain.
  const reportedFailure =
    reportedHealth === 'degraded' || reportedHealth === 'error' || reportedHealth === 'unavailable';
  if (!group.choices.length) {
    return { ...group, availableChoices, ...presetOnlyHealth(preset) };
  }
  const health: ProviderHealth =
    reportedHealth === PROVIDER_NEEDS_SETUP
      ? 'setup'
      : reportedHealth === 'checking'
        ? 'checking'
        : reportedFailure
          ? reportedHealth === 'unavailable'
            ? 'unavailable'
            : 'degraded'
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
    setupNeed: health === 'setup' ? (providerSetupNeed(preset) ?? 'sign_in') : undefined,
    detail: details[0],
    failure: group.choices.find((choice) => choice.failure)?.failure,
    client: group.choices.find((choice) => choice.client)?.client,
  };
}

export function providerNodeValue(providerId: string): string {
  return `${PROVIDER_NODE_PREFIX}${providerId}`;
}

/** A model row's tree identity. */
export function modelNodeValue(choice: ClioModelOption): string {
  return `${MODEL_NODE_PREFIX}${choice.providerId}:${choice.id}`;
}

export function providerSearchDescription(group: ProviderGroup): string {
  if (group.health === 'unavailable' || group.health === 'setup') {
    return providerGroupStatus(group).label;
  }
  const count = group.availableChoices.length;
  return `${count} ${count === 1 ? 'model' : 'models'}`;
}

export function formatFreshness(freshness: string): string {
  const parsed = new Date(freshness);
  return Number.isNaN(parsed.getTime()) ? freshness : parsed.toLocaleString();
}

/**
 * The provider rows every provider surface lists -- the model picker's
 * column and Settings > Providers alike -- built ONE way from the same model
 * options: one group per provider that has catalog rows, plus (when
 * `includeUnconfigured`) a zero-model placeholder for every preset the
 * service reports but that has never had a catalog entry of its own. Sorted
 * usable first, never-checked last, then by name.
 */
export function providerGroupsFromOptions(
  options: readonly ClioModelOption[],
  presets: readonly LanguageModelPreset[],
  includeUnconfigured: boolean,
): ProviderGroup[] {
  const grouped = new Map<string, { id: string; name: string; choices: ClioModelOption[] }>();
  for (const option of options) {
    const group = grouped.get(option.providerId) ?? {
      id: option.providerId,
      name: option.providerName,
      choices: [],
    };
    group.choices.push(option);
    grouped.set(option.providerId, group);
  }
  const presetsById = new Map(presets.map((preset) => [preset.id, preset]));
  const configured = [...grouped.values()].map((group) =>
    toProviderGroup(group, presetsById.get(group.id)),
  );
  const unconfigured = includeUnconfigured
    ? presets
        .filter((preset) => !grouped.has(preset.id))
        .map((preset) => ({
          ...toProviderGroup({ id: preset.id, name: preset.label, choices: [] }, preset),
          // No catalog row carries a reason yet: the preset's own status does.
          detail: providerStatusDetail(preset),
        }))
    : [];
  return [...configured, ...unconfigured].sort(
    (left, right) =>
      PROVIDER_HEALTH_ORDER[left.health] - PROVIDER_HEALTH_ORDER[right.health] ||
      left.name.localeCompare(right.name),
  );
}

/** The model count a provider row shows: usable models only, so a provider
 * whose latest check failed (rejected key, failed probe serving a dated
 * list) shows none, whatever rows remain. */
export function providerUsableModelCount(group: ProviderGroup): number {
  return group.health === 'healthy' || group.health === 'checking'
    ? group.availableChoices.length
    : 0;
}
