/**
 * Observability contract (gact-tui#336).
 *
 * The tools tab is ALSO the kit's proof case: the owner's example was "adding
 * a tools-available tab with a per-expert dropdown must be trivial
 * composition". If that needs anything bespoke, the kit has failed its purpose.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Observability } from '../../src/observability/Observability';
import type { ObservabilityData } from '../../src/observability/types';

const DATA: ObservabilityData = {
  agents: [
    { id: 'main', label: 'main', status: 'running', depth: 0 },
    { id: 'geospatial', label: 'geospatial', status: 'done', depth: 1, duration: '1m 12s' },
    { id: 'data', label: 'data', status: 'running', depth: 1 },
  ],
  runs: [
    { id: 'task_b7525159dde5', agent: 'geospatial', state: 'succeeded', duration: '1m 12s' },
    { id: 'task_b899efeeca04', agent: 'data', state: 'running' },
  ],
  toolsByExpert: {
    geospatial: [{ name: 'geo_geocode', description: 'Resolve a place name' }],
    data: [
      { name: 'ndp_dataset_discovery', description: 'Search NDP' },
      { name: 'stage_resource', description: 'Stage a resource locally' },
    ],
  },
  artifacts: [{ id: 'art_5f21c9d0e83a', label: 'earthscope_stations.csv', kind: 'dataset / csv' }],
  context: { usedPercent: 41, tokens: 82_000, limit: 200_000 },
};

describe('Observability', () => {
  it('opens on the agents tab', () => {
    render(<Observability data={DATA} />);
    expect(screen.getByRole('tab', { name: /agents/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('lists every agent with its status as text', () => {
    render(<Observability data={DATA} />);
    const panel = screen.getByTestId('obs-agents');
    expect(within(panel).getByText('geospatial')).toBeInTheDocument();
    // Status must be readable, not just a colour.
    expect(within(panel).getAllByText(/running|done/).length).toBeGreaterThanOrEqual(3);
  });

  it('lists runs with their terminal state', () => {
    render(<Observability data={DATA} />);
    fireEvent.click(screen.getByRole('tab', { name: /runs/i }));
    const panel = screen.getByTestId('obs-runs');
    expect(within(panel).getByText('task_b7525159dde5')).toBeInTheDocument();
    expect(within(panel).getByText('succeeded')).toBeInTheDocument();
  });

  // ---- the kit proof case ----

  it('filters available tools by expert through the kit select', () => {
    render(<Observability data={DATA} />);
    fireEvent.click(screen.getByRole('tab', { name: /tools/i }));

    // Defaults to the first expert.
    expect(screen.getByText('geo_geocode')).toBeInTheDocument();
    expect(screen.queryByText('stage_resource')).toBeNull();

    fireEvent.click(screen.getByRole('combobox', { name: /expert/i }));
    fireEvent.click(screen.getByRole('option', { name: /^data$/ }));

    expect(screen.getByText('stage_resource')).toBeInTheDocument();
    expect(screen.queryByText('geo_geocode')).toBeNull();
  });

  it('shows how many tools the selected expert exposes', () => {
    render(<Observability data={DATA} />);
    fireEvent.click(screen.getByRole('tab', { name: /tools/i }));
    expect(screen.getByTestId('obs-tools-count')).toHaveTextContent('1');
  });

  it('lists artifacts', () => {
    render(<Observability data={DATA} />);
    fireEvent.click(screen.getByRole('tab', { name: /artifacts/i }));
    expect(screen.getByText('earthscope_stations.csv')).toBeInTheDocument();
  });

  it('reports context usage with its denominator, not a bare percentage', () => {
    // A percentage with no denominator cannot be sanity-checked by the reader.
    render(<Observability data={DATA} />);
    fireEvent.click(screen.getByRole('tab', { name: /context/i }));
    const panel = screen.getByTestId('obs-context');
    expect(panel).toHaveTextContent('41%');
    expect(panel).toHaveTextContent(/200,000|200000/);
  });

  it('states emptiness rather than rendering a blank tab', () => {
    render(
      <Observability
        data={{ agents: [], runs: [], toolsByExpert: {}, artifacts: [] }}
       
      />,
    );
    expect(screen.getByTestId('obs-empty')).toBeInTheDocument();
  });

});
