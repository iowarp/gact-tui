import { useMemo } from 'react';
import { ConnectorOfferResponse } from '@/components/clio/connector-offer-response';
import { tourAnchor } from '@/lib/onboarding/tour-anchors';
import { tourOfferInteraction } from '@/lib/onboarding/tour-offer';
import { t } from '@lingui/core/macro';

/**
 * The "Bring in tools" step's example (DC-D8): the real offer card the agent shows when
 * a request needs a connector, fed by the tour transport. It is a picture of the card:
 * inert, so nothing on it can be pressed or focused, and no answer goes anywhere.
 */
export function TourOfferCard({ className }: { className?: string }) {
  const interaction = useMemo(() => tourOfferInteraction(), []);
  return (
    <div
      aria-label={t`Example offer`}
      className={className}
      data-slot="tour-offer"
      inert
      role="group"
      {...tourAnchor('connector-offer')}
    >
      <ConnectorOfferResponse interaction={interaction} onResponse={() => Promise.resolve()} />
    </div>
  );
}
