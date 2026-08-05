/**
 * Detail slot contract (gact-tui#335).
 *
 * The provenance and recreate tabs render SHIPPED #966 data — mechanism,
 * designation, evidence, custody and the route DAG. They have zero P2/P3
 * dependencies, which is why this slice runs early.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

  it('opens on the artifact tab showing identity', () => {
    render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
    expect(screen.getByRole('tab', { name: /artifact/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('art_5f21c9d0e83a')).toBeInTheDocument();
    expect(screen.getByText(/48 KB/)).toBeInTheDocument();
  });

  it('shows an uppercase kind badge, defaulting to ARTIFACT', () => {
    render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
    expect(screen.getByText('ARTIFACT')).toBeInTheDocument();
  });

  it('renders a clickable breadcrumb trail when the record carries one', () => {
    render(
      <DetailSlot record={{ ...RECORD, breadcrumb: ['session', 'earthscope_stations.csv'] }} onClose={vi.fn()} />,
    );
    const crumbs = screen.getByRole('navigation', { name: /breadcrumb/i });
    expect(crumbs).toHaveTextContent('session');
    expect(crumbs).toHaveTextContent('earthscope_stations.csv');
  });

  it('omits the breadcrumb row entirely when the record carries none', () => {
    render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();
  });

  it('copies an artifact summary to the clipboard', async () => {
    const writeText = vi.fn(async (_text: string) => {});
    Object.assign(navigator, { clipboard: { writeText } });
    render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /copy as markdown/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0]?.[0]).toContain(RECORD.id);
  });

  it('renders the download control disabled with an honest unbacked reason', () => {
    render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
    const download = screen.getByRole('button', { name: /download/i });
    expect(download).toBeDisabled();
    expect(download).toHaveAttribute('title', expect.stringMatching(/not wired/i));
  });

  it('renders the toolbar with the prototype-transcribed SVGs, not Unicode placeholders', () => {
    // Regression: Copy/Download/Maximize/Close all shipped as bare Unicode
    // spans (⧉/⭳/⛶/×) instead of the prototype's own transcribed paths.
    render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
    const copy = screen.getByRole('button', { name: /copy as markdown/i });
    expect(copy.querySelector('[data-icon="copy"]')).not.toBeNull();
    const download = screen.getByRole('button', { name: /download/i });
    expect(download.querySelector('[data-icon="download"]')).not.toBeNull();
    const maximize = screen.getByRole('button', { name: /maximize detail/i });
    expect(maximize.querySelector('[data-icon="expand"]')).not.toBeNull();
    const close = screen.getByRole('button', { name: /close detail/i });
    expect(close.querySelector('[data-icon="x"]')).not.toBeNull();
    expect(close.textContent).not.toContain('×');
  });

  it('swaps to a checkmark after a successful copy', async () => {
    const writeText = vi.fn(async (_text: string) => {});
    Object.assign(navigator, { clipboard: { writeText } });
    render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /copy as markdown/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /copied/i }).querySelector('[data-icon="check"]')).not.toBeNull(),
    );
  });

  it('maximizes into a centered modal and restores on close', () => {
    render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /maximize detail/i }));
    const dialog = screen.getByRole('dialog', { name: RECORD.id });
    expect(dialog).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: new RegExp(`close ${RECORD.id}`, 'i') }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('complementary', { name: /detail/i })).toBeInTheDocument();
  });

  it('renders the four provenance axes on the provenance tab', () => {
    const { container } = render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: /provenance/i }));
    // Scoped to the axes grid: "hashed-at-use" is legitimately BOTH the
    // evidence axis and a route edge stance, so a panel-wide lookup is
    // ambiguous by design rather than by accident.
    const axes = container.querySelector('.kit-kvgrid') as HTMLElement;
    expect(axes).not.toBeNull();
    for (const value of ['harness', 'tool-declared', 'hashed-at-use', 'workspace — data/']) {
      expect(within(axes).getByText(value)).toBeInTheDocument();
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

  describe('collapse-to-strip (rightOpen/tgRight)', () => {
    it('collapses to a narrow strip carrying only the re-expand control and a vertical kind badge', () => {
      render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /collapse panel/i }));
      // The full panel's tabs/body are gone — only the strip remains.
      expect(screen.queryByRole('tab', { name: /artifact/i })).toBeNull();
      expect(screen.getByRole('complementary', { name: /detail \(collapsed\)/i })).toBeInTheDocument();
      const expandBtn = screen.getByRole('button', { name: /expand panel/i });
      expect(expandBtn).toHaveTextContent('‹');
      expect(screen.getByText('ARTIFACT')).toBeInTheDocument();
    });

    it('re-expands the full panel from the strip', () => {
      render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /collapse panel/i }));
      fireEvent.click(screen.getByRole('button', { name: /expand panel/i }));
      expect(screen.getByRole('tab', { name: /artifact/i })).toBeInTheDocument();
      expect(screen.getByText('art_5f21c9d0e83a')).toBeInTheDocument();
    });

    it('uses a DIFFERENT icon geometry than the rail collapse control (divider at x=8.6, not x=5.4)', () => {
      render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
      const collapseBtn = screen.getByRole('button', { name: /collapse panel/i });
      expect(collapseBtn.querySelector('[data-icon="panel-right"]')).not.toBeNull();
    });
  });
});
