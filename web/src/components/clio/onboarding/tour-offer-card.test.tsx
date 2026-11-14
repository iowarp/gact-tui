import { ClioRepository, TransportError } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { vocab } from '@/lib/brand-vocabulary';
import { TOUR_ANCHORS } from '@/lib/onboarding/tour-anchors';
import { TOUR_OFFER_CONNECTOR, tourOfferInteraction } from '@/lib/onboarding/tour-offer';
import { TOUR_STEPS } from '@/lib/onboarding/tour-script';
import { TourTransport } from '@/lib/onboarding/tour-transport';
import { RepositoryOverrideProvider } from '@/providers/repository-override';

vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1' } }),
}));

import { TourOfferCard } from './tour-offer-card';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the tour’s "Bring in tools" step (DC-D8)', () => {
  it('comes right after Explore the results, points at the offer and names the product', () => {
    const ids = TOUR_STEPS.map((step) => step.id);
    expect(ids.indexOf('connectors')).toBe(ids.indexOf('explore') + 1);
    expect(ids.slice(ids.indexOf('explore'), ids.indexOf('explore') + 3)).toEqual([
      'explore',
      'connectors',
      'select',
    ]);
    const step = TOUR_STEPS.find((row) => row.id === 'connectors')!;
    expect(step.title).toBe('Bring in tools');
    expect(step.anchor).toBe('connector-offer');
    expect(TOUR_ANCHORS).toContain('connector-offer');
    expect(step.practice).toEqual({ turns: 2, offer: true });
    expect(step.body).toBe(
      `Connectors and plugins add tools to a conversation. Just ask, and ${vocab.agent} offers what fits, like this card, or browse Discover in Settings.`,
    );
    // Only this step shows the example offer.
    expect(TOUR_STEPS.filter((row) => row.practice?.offer).map((row) => row.id)).toEqual([
      'connectors',
    ]);
  });

  it('answers the card’s reads from the tour transport and refuses the rest', async () => {
    const transport = new ClioRepository(new TourTransport());
    const [row] = await transport.connectors();
    expect(row).toMatchObject({ id: TOUR_OFFER_CONNECTOR.id, enabled: false });
    expect(await transport.connectorLogo(TOUR_OFFER_CONNECTOR.id)).toContain('<svg');
    await expect(transport.enableConnector(TOUR_OFFER_CONNECTOR.id)).rejects.toBeInstanceOf(
      TransportError,
    );
  });

  it('shows the real offer card, with its logo, inert, and makes no request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <RepositoryOverrideProvider repository={new ClioRepository(new TourTransport())}>
          <TooltipProvider>
            <TourOfferCard />
          </TooltipProvider>
        </RepositoryOverrideProvider>
      </QueryClientProvider>,
    );
    const example = screen.getByRole('group', { name: 'Example offer' });
    expect(example.hasAttribute('inert')).toBe(true);
    expect(example.getAttribute('data-tour')).toBe('connector-offer');
    expect(example.textContent).toContain('Add Geo to this conversation?');
    expect(example.textContent).toContain('interactive 3D globe');
    expect(example.textContent).toContain(
      'You asked for hurricane tracks; this shows them on an interactive 3D globe.',
    );
    expect(example.textContent).toContain('Not enabled');
    expect(example.textContent).toContain('1 MCP server');
    await waitFor(() =>
      expect(
        example.querySelector<HTMLImageElement>('[data-slot="connector-logo"]')?.src,
      ).toMatch(/^data:image\/svg\+xml/),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(tourOfferInteraction().payload).toMatchObject({ intent: 'enable', connector_id: 'geo' });
  });
});
