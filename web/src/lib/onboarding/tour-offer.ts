import type { PendingInteraction } from '@clio/core/v3';
import { t } from '@lingui/core/macro';
import example from './tour-offer-example.json';
import { TOUR_PRACTICE_SESSION_ID } from './tour-transport';

/**
 * The startup tour's example offer ("Bring in tools", DC-D8): the card the agent shows
 * when a request needs a connector that is off. The connector's identity and logo are
 * data (`tour-offer-example.json`); its description and the agent's reason are written
 * here so they are translated with the rest of the tour.
 */
export const TOUR_OFFER_CONNECTOR = example.connector;

const description = () =>
  t`Show stations, regions, footprints and tracks from GeoJSON on an interactive 3D globe, make map images, and find places by name.`;

/** The example connector as the connector list reports it: in the catalog, not enabled. */
export function tourOfferConnectorRow() {
  const { id, name } = TOUR_OFFER_CONNECTOR;
  return {
    id,
    name,
    description: description(),
    logo_url: `/v1/connectors/${id}/logo`,
    logo_dark_url: null,
    source: 'catalog',
    enabled: false,
    tool_count: null,
    state: { status: 'ready', needs: [], reason: null },
    needs: [],
  };
}

/** The offer as a pending interaction of the practice conversation; nobody answers it. */
export function tourOfferInteraction(): PendingInteraction {
  const { id, name } = TOUR_OFFER_CONNECTOR;
  return {
    id: 'tour_offer',
    kind: 'connector_setup',
    // No owner: the card reads no conversation-specific values.
    owner_session_id: '',
    attended_session_id: TOUR_PRACTICE_SESSION_ID,
    status: 'pending',
    title: name,
    prompt: '',
    source: { protocol: 'mcp', tool_name: 'offer_plugin', invocation_id: 'tour_offer' },
    created_at: '2026-01-01T00:00:00Z',
    payload: {
      connector_id: id,
      connector_name: name,
      intent: 'enable',
      description: description(),
      reason: t`You asked for hurricane tracks; this shows them on an interactive 3D globe.`,
      connector_enabled: false,
      missing: [],
    },
    actions: ['submit', 'decline'],
  };
}
