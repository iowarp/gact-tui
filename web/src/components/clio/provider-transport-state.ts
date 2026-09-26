import type { ProviderCatalogTransport } from '@clio/core/v3';
import type { ClioModelOption } from '@/lib/model-options';
import type { ProviderGroup } from './model-picker-model';

/**
 * One transport's state, derived from its catalog row -- the ONE source for
 * whether its section shows, what it shows and which action it offers:
 *
 * - `ready`: its models are listed;
 * - `signed_out`: a transport CLIO signs in itself (`auth` present) that is
 *   not ready -- its section is just its heading and Log in;
 * - `unchecked`: the service has not asked it yet (a typed `*_not_checked`
 *   reason) -- it is checked when shown, and shows the check running;
 * - `unavailable`: asked, and not usable (e.g. the local app is not
 *   installed or not signed in) -- its section is removed entirely.
 */
export type TransportState = 'ready' | 'signed_out' | 'unchecked' | 'unavailable';

export interface TransportSection {
  transport: ProviderCatalogTransport;
  state: TransportState;
  /** Short heading ("SDK", "Direct"). */
  label: string;
  /** The heading's hover explanation. */
  info: string;
  /** This transport's selectable models (empty unless `ready`). */
  models: ClioModelOption[];
  /** CLIO can sign this transport out (its own `auth.logout`). */
  canLogOut: boolean;
}

/** The typed code before a reason's sentence ("codex_sdk_not_checked: ..."). */
function reasonCode(reason: string): string {
  return /^([a-z][a-z0-9]*(?:_[a-z0-9]+)+)(?::|$)/u.exec(reason.trim())?.[1] ?? '';
}

export function transportState(transport: ProviderCatalogTransport): TransportState {
  if (transport.health === 'ready') return 'ready';
  if (transport.auth) return 'signed_out';
  if (reasonCode(transport.reason).endsWith('_not_checked')) return 'unchecked';
  return 'unavailable';
}

/**
 * Heading and hover text per transport kind. `sdk` reaches the provider
 * through the app installed on the connected computer; `direct` talks to the
 * provider's API itself. Any other transport keeps the service's own label.
 */
function transportCopy(
  transport: ProviderCatalogTransport,
  providerName: string,
): { label: string; info: string } {
  if (transport.id === 'sdk') {
    return { label: 'SDK', info: `Through the installed ${providerName}.` };
  }
  if (transport.id === 'direct') return { label: 'Direct', info: 'Direct API access.' };
  return { label: transport.label, info: transport.label };
}

/**
 * Which half of a multi-transport provider a model row came from ("SDK",
 * "Direct"), or `undefined` for a provider reachable only one way.
 */
export function modelTransportLabel(option: ClioModelOption): string | undefined {
  if (!option.transport || (option.transports?.length ?? 0) < 2) return undefined;
  const transport = option.transports?.find((item) => item.id === option.transport);
  return transport ? transportCopy(transport, option.providerName).label : undefined;
}

/** Every transport of a multi-transport provider, in the service's order. */
export function transportSections(group: ProviderGroup): TransportSection[] {
  return (group.transports ?? []).map((transport) => {
    const state = transportState(transport);
    return {
      transport,
      state,
      ...transportCopy(transport, group.name),
      models:
        state === 'ready'
          ? group.availableChoices.filter((choice) => choice.transport === transport.id)
          : [],
      canLogOut: state === 'ready' && transport.auth?.logout === true,
    };
  });
}

/** Whether a provider is reachable more than one way (its panel splits). */
export function isMultiTransport(group: ProviderGroup | undefined): boolean {
  return (group?.transports?.length ?? 0) > 1;
}

/**
 * The sections a panel shows: ready and signed-out transports always, an
 * unchecked one only while its check runs, an unavailable one never.
 */
export function visibleTransportSections(
  sections: readonly TransportSection[],
  checking: boolean,
): TransportSection[] {
  return sections.filter(
    (section) =>
      section.state === 'ready' ||
      section.state === 'signed_out' ||
      (section.state === 'unchecked' && checking),
  );
}
