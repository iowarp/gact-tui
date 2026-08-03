/**
 * Detail slot contract (gact-tui#335).
 *
 * The provenance and recreate tabs render SHIPPED #966 data — mechanism,
 * designation, evidence, custody and the route DAG. They have zero P2/P3
 * dependencies, which is why this slice runs early.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DetailSlot } from '../../src/detail/DetailSlot';
import type { ArtifactRecord } from '../../src/detail/types';

const RECORD: ArtifactRecord = {
  id: 'art_5f21c9d0e83a',
  sha: 'sha256:b3c94ff0a2e1…41ad',
  size: '48 KB (1,101 rows)',
  kind: 'dataset / csv',
  mechanism: 'harness',
  designation: 'tool-declared',
  evidence: 'hashed-at-use',
  custody: 'workspace — data/',
  note: 'Clean station-metadata catalog.',
  instrument: 'stage_resource(resource="earthscope_stations.csv")',
  route: [
    { kind: 'node', nodeType: 'artifact', label: 'ds2.datacollaboratory.org/…csv', sub: 'external source' },
    { kind: 'edge', edge: 'used', stance: 'authority-asserted' },
    { kind: 'node', nodeType: 'activity', label: 'stage_resource', sub: 'call_a4c19b2e' },
    { kind: 'edge', edge: 'generated', stance: 'hashed-at-use' },
    { kind: 'node', nodeType: 'artifact', label: 'earthscope_stations.csv', sub: 'this version', self: true },
  ],
};

describe('DetailSlot', () => {
  it('is a labelled complementary region', () => {
    render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
    expect(screen.getByRole('complementary', { name: /detail/i })).toBeInTheDocument();
  });

  it('opens on the overview tab showing identity', () => {
    render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
    expect(screen.getByText('art_5f21c9d0e83a')).toBeInTheDocument();
    expect(screen.getByText(/48 KB/)).toBeInTheDocument();
  });

  it('renders the four provenance axes on the provenance tab', () => {
    render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: /provenance/i }));
    const panel = screen.getByTestId('detail-provenance');
    for (const value of ['harness', 'tool-declared', 'hashed-at-use', 'workspace — data/']) {
      expect(within(panel).getByText(value)).toBeInTheDocument();
    }
  });

  it('renders the route DAG in order with typed edges', () => {
    render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: /provenance/i }));
    const steps = screen.getAllByTestId(/route-(node|edge)/);
    expect(steps).toHaveLength(5);
    expect(steps[1]).toHaveTextContent('used');
    expect(steps[3]).toHaveTextContent('generated');
  });

  it('marks the record itself in its own route', () => {
    render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: /provenance/i }));
    expect(screen.getByTestId('route-node-self')).toHaveTextContent('this version');
  });

  it('shows the instrument on the recreate tab', () => {
    render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: /recreate/i }));
    expect(screen.getByTestId('detail-recreate')).toHaveTextContent('stage_resource');
  });

  it('says so plainly when a record carries no route', () => {
    // No silent blank: an absent DAG is stated, not rendered as emptiness.
    render(<DetailSlot record={{ ...RECORD, route: [] }} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: /provenance/i }));
    expect(screen.getByTestId('route-absent')).toBeInTheDocument();
  });

  it('says so plainly when a record cannot be recreated', () => {
    const record = { ...RECORD };
    delete (record as { instrument?: string }).instrument;
    render(<DetailSlot record={record} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: /recreate/i }));
    expect(screen.getByTestId('recreate-absent')).toBeInTheDocument();
  });

  it('closes', () => {
    const onClose = vi.fn();
    render(<DetailSlot record={RECORD} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close detail/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
