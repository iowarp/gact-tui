/**
 * Detail slot contract (gact-tui#335).
 *
 * The provenance and recreate tabs render SHIPPED #966 data — mechanism,
 * designation, evidence, custody and the route DAG. They have zero P2/P3
 * dependencies, which is why this slice runs early.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Client, SessionArtifactRecord, SessionArtifactVersion } from '@clio/core';
import { DetailSlot } from '../../src/detail/DetailSlot';
import { mintArtifactRecord, routeFromLineage, type LineageGraph } from '../../src/detail/mintRecord';
import type { ArtifactRecord, RouteStep } from '../../src/detail/types';

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
  // The provenance rework's one-line-per-node route shape
  // (docs/design/provenance-graph-2026-08.md).
  route: [
    { kind: 'node', nodeType: 'artifact', label: 'ds2.datacollaboratory.org/…csv', sub: 'external source' },
    { kind: 'edge', edge: 'used', stance: 'authority-asserted' },
    {
      kind: 'node',
      nodeType: 'activity',
      label: 'stage_resource',
      tool: 'stage_resource',
      duration: '4.2s',
      sessionId: 'sess_c6241fc8906f',
    },
    { kind: 'edge', edge: 'generated', stance: 'hashed-at-use' },
    {
      kind: 'node',
      nodeType: 'artifact',
      label: 'earthscope_stations.csv',
      artifactId: 'art_5f21c9d0e83a',
      version: 'v1',
      size: '48 KB',
      self: true,
    },
  ],
};

/** Mockup-2's shape: the upstream chain minted by ANOTHER session. */
const CROSS_SESSION_ROUTE: RouteStep[] = [
  {
    kind: 'node',
    nodeType: 'activity',
    label: 'ndp_stage_resource',
    tool: 'ndp_stage_resource',
    duration: '1.7s',
    sessionId: 'sess_9f17aa20bb31',
    foreignSession: true,
  },
  { kind: 'edge', edge: 'generated', stance: 'hashed-at-use' },
  {
    kind: 'node',
    nodeType: 'artifact',
    label: 'MTA1.CI.LY_.30.csv',
    artifactId: 'artifact_csv01',
    version: 'v1',
    size: '50.4 MB',
    createdAt: '2026-08-05T12:43:00',
    sessionId: 'sess_9f17aa20bb31',
    foreignSession: true,
  },
  { kind: 'edge', edge: 'used', stance: 'hashed-at-use' },
  {
    kind: 'node',
    nodeType: 'activity',
    label: 'plot_plot_timeseries',
    tool: 'plot_plot_timeseries',
    duration: '7.9s',
    sessionId: 'sess_c6241fc8906f',
  },
  { kind: 'edge', edge: 'generated', stance: 'hashed-at-use' },
  {
    kind: 'node',
    nodeType: 'artifact',
    label: 'MTA1.CI.LY_.30_position.png',
    artifactId: 'artifact_png01',
    version: 'v1',
    size: '179 KB',
    sessionId: 'sess_c6241fc8906f',
    self: true,
  },
];

describe('DetailSlot', () => {
  it('is a labelled complementary region', () => {
    render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
    expect(screen.getByRole('complementary', { name: /detail/i })).toBeInTheDocument();
  });

  it('opens on the artifact tab showing identity', () => {
    render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
    expect(screen.getByRole('tab', { name: /artifact/i })).toHaveAttribute('aria-selected', 'true');
    // No breadcrumb on this fixture, so the title honestly falls back to the
    // id (the id also appears again, small, on the meta line below it).
    expect(screen.getByTestId('detail-title')).toHaveTextContent('art_5f21c9d0e83a');
    expect(screen.getByTestId('detail-meta-id')).toHaveTextContent('art_5f21c9d0e83a');
    expect(screen.getByText(/48 KB/)).toBeInTheDocument();
  });

  describe('Overview identity block (owner redesign 2026-08-05)', () => {
    it('prefers the real filename from the breadcrumb as the title, over the opaque id', () => {
      render(
        <DetailSlot
          record={{ ...RECORD, breadcrumb: ['session', 'earthscope_stations.csv'] }}
          onClose={vi.fn()}
        />,
      );
      expect(screen.getByTestId('detail-title')).toHaveTextContent('earthscope_stations.csv');
      // The id still renders, demoted onto the small meta line.
      expect(screen.getByTestId('detail-meta-id')).toHaveTextContent('art_5f21c9d0e83a');
    });

    it('renders the kind as a small chip next to the title, not a kv-grid row', () => {
      render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
      const titleLine = screen.getByTestId('detail-title').closest('.detail__titleline') as HTMLElement;
      expect(within(titleLine).getByText('dataset / csv')).toBeInTheDocument();
    });

    it('is panel CHROME: renders above the tab strip and stays visible across every tab, never repeated in tab content', () => {
      render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
      const identity = screen.getByTestId('detail-identity');
      const tabs = screen.getByRole('tablist', { name: /detail views/i });
      // DOCUMENT_POSITION_FOLLOWING (4): identity precedes the tab strip.
      expect(identity.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

      fireEvent.click(screen.getByRole('tab', { name: /provenance/i }));
      expect(screen.getByTestId('detail-identity')).toBeInTheDocument();
      expect(screen.getByTestId('detail-title')).toHaveTextContent('art_5f21c9d0e83a');

      fireEvent.click(screen.getByRole('tab', { name: /recreate/i }));
      expect(screen.getByTestId('detail-identity')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('tab', { name: /artifact/i }));
      // Back on the artifact tab, the identity never re-appears inside the
      // tab body — the Overview tab holds only the preview now.
      const overview = screen.getByTestId('detail-overview');
      expect(within(overview).queryByTestId('detail-title')).toBeNull();
      expect(within(overview).queryByTestId('detail-meta')).toBeNull();
    });

    it('drops the old id/kind/size/sha kv-grid from the Overview tab entirely', () => {
      render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
      const overview = screen.getByTestId('detail-overview');
      expect(overview.querySelector('.kit-kvgrid')).toBeNull();
    });

    it('truncates a long id from the middle on the meta line, with the full id on hover', () => {
      const longId = `art_${'f'.repeat(60)}`;
      render(<DetailSlot record={{ ...RECORD, id: longId }} onClose={vi.fn()} />);
      const metaId = screen.getByTestId('detail-meta-id');
      expect(metaId.textContent).not.toBe(longId);
      expect(metaId.textContent).toContain('…');
      expect(metaId).toHaveAttribute('title', longId);
    });
  });

  describe('sha compact affordance (owner redesign 2026-08-05)', () => {
    it('shows a short mono prefix, not the full hash', () => {
      render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
      const sha = screen.getByTestId('detail-sha');
      expect(sha).toHaveTextContent('b3c94ff0');
      expect(sha.textContent).not.toContain(RECORD.sha!);
    });

    it('reveals the full hash on hover via the title attribute', () => {
      render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
      expect(screen.getByTestId('detail-sha')).toHaveAttribute('title', RECORD.sha!);
    });

    it('copies the full hash to the clipboard on click, with a transient "copied" swap', async () => {
      const writeText = vi.fn(async (_text: string) => {});
      Object.assign(navigator, { clipboard: { writeText } });
      render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
      fireEvent.click(screen.getByTestId('detail-sha'));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith(RECORD.sha!));
      await waitFor(() => expect(screen.getByTestId('detail-sha')).toHaveTextContent('copied'));
    });

    it('on a clipboard failure, shows the full hash selected instead of pretending it copied', async () => {
      const writeText = vi.fn(async () => {
        throw new Error('clipboard permission denied');
      });
      Object.assign(navigator, { clipboard: { writeText } });
      render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
      fireEvent.click(screen.getByTestId('detail-sha'));
      await waitFor(() => expect(screen.getByTestId('detail-sha')).toHaveTextContent(RECORD.sha!));
      // Never a silent no-op: it never claims "copied" when it didn't.
      expect(screen.getByTestId('detail-sha')).not.toHaveTextContent('copied');
    });
  });

  it('shows an uppercase kind badge, defaulting to ARTIFACT', () => {
    render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
    expect(screen.getByText('ARTIFACT')).toBeInTheDocument();
  });

  it('renders a clickable breadcrumb prefix when the record carries one, WITHOUT repeating the name the title already shows (owner refinement 2026-08-05: the repetition the owner circled)', () => {
    render(
      <DetailSlot record={{ ...RECORD, breadcrumb: ['session', 'earthscope_stations.csv'] }} onClose={vi.fn()} />,
    );
    const crumbs = screen.getByRole('navigation', { name: /breadcrumb/i });
    expect(crumbs).toHaveTextContent('session');
    // The record's own (self) name is NOT repeated inside the crumb trail —
    // it renders exactly once, as the title.
    expect(crumbs).not.toHaveTextContent('earthscope_stations.csv');
    expect(screen.getByTestId('detail-title')).toHaveTextContent('earthscope_stations.csv');
  });

  it('omits the breadcrumb row entirely when the record carries none', () => {
    render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();
  });

  it('uses the prototype\'s "›" separator glyph between breadcrumb segments, not a slash', () => {
    render(
      <DetailSlot record={{ ...RECORD, breadcrumb: ['session', 'earthscope_stations.csv'] }} onClose={vi.fn()} />,
    );
    const crumbs = screen.getByRole('navigation', { name: /breadcrumb/i });
    expect(crumbs).toHaveTextContent('›');
    expect(crumbs.textContent).not.toContain('/');
  });

  it('the first ("session") crumb is a real, focusable button that closes the detail slot on click — the only crumb with a well-defined destination when there is no multi-level detail stack', () => {
    const onClose = vi.fn();
    render(
      <DetailSlot
        record={{ ...RECORD, breadcrumb: ['session', 'earthscope_stations.csv'] }}
        onClose={onClose}
      />,
    );
    const crumbs = screen.getByRole('navigation', { name: /breadcrumb/i });
    const sessionCrumb = within(crumbs).getByRole('button', { name: 'session' });
    fireEvent.click(sessionCrumb);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the trailing (self) crumb is not a button — it is the plain title heading, not a nav entry with nowhere to navigate to', () => {
    render(
      <DetailSlot record={{ ...RECORD, breadcrumb: ['session', 'earthscope_stations.csv'] }} onClose={vi.fn()} />,
    );
    const crumbs = screen.getByRole('navigation', { name: /breadcrumb/i });
    expect(within(crumbs).queryByRole('button', { name: 'earthscope_stations.csv' })).toBeNull();
    expect(within(crumbs).queryByText('earthscope_stations.csv')).toBeNull();
    const title = screen.getByTestId('detail-title');
    expect(title).toHaveTextContent('earthscope_stations.csv');
    expect(title.tagName).not.toBe('BUTTON');
  });

  it('copies an artifact summary to the clipboard', async () => {
    const writeText = vi.fn(async (_text: string) => {});
    Object.assign(navigator, { clipboard: { writeText } });
    render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /copy as markdown/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0]?.[0]).toContain(RECORD.id);
  });

  it('renders the download control disabled with an honest reason when no client is wired', () => {
    // gact-tui#335 icons-and-buttons audit_correction: a real backend route
    // exists (GET /v1/artifacts/{id}/export, clio-agent #973) — this is no
    // longer a permanent "not wired" gap, only degraded when DetailSlot has
    // no live connection to call through (see the `client` prop).
    render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
    const download = screen.getByRole('button', { name: 'Download' });
    expect(download).toBeDisabled();
    expect(download).toHaveAttribute('title', expect.stringMatching(/live connection/i));
  });

  describe('Download menu (tgArtMenu/popArtMenu, client wired)', () => {
    function fakeClient(overrides: Partial<Client> = {}): Client {
      return {
        baseUrl: 'http://localhost:7777',
        exportArtifact: vi.fn(async () => ({
          blob: new Blob(['zip bytes'], { type: 'application/zip' }),
          filename: 'art_5f21c9d0e83a.crate.zip',
        })),
        ...overrides,
      } as unknown as Client;
    }

    it('opens the three-row menu (download file / open storage location / copy link)', () => {
      render(<DetailSlot record={RECORD} client={fakeClient()} onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Download' }));
      expect(screen.getByRole('button', { name: 'download file' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'open storage location' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'copy link to artifact' })).toBeInTheDocument();
    });

    it('keeps "open storage location" disabled with an honest desktop-only reason', () => {
      render(<DetailSlot record={RECORD} client={fakeClient()} onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Download' }));
      const openFolder = screen.getByRole('button', { name: 'open storage location' });
      expect(openFolder).toBeDisabled();
      expect(openFolder).toHaveAttribute('title', expect.stringMatching(/desktop-only/i));
    });

    it('downloads the real export bundle via GET /v1/artifacts/{id}/export', async () => {
      const blob = new Blob(['zip bytes'], { type: 'application/zip' });
      const exportArtifact = vi.fn(async (id: string) => {
        expect(id).toBe(RECORD.id);
        return { blob, filename: 'art_5f21c9d0e83a.crate.zip' };
      });
      const client = fakeClient({ exportArtifact });
      const createObjectURL = vi.fn(() => 'blob:mock-url');
      const revokeObjectURL = vi.fn();
      Object.assign(URL, { createObjectURL, revokeObjectURL });
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      render(<DetailSlot record={RECORD} client={client} onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Download' }));
      fireEvent.click(screen.getByRole('button', { name: 'download file' }));

      await waitFor(() => expect(exportArtifact).toHaveBeenCalledWith(RECORD.id));
      expect(createObjectURL).toHaveBeenCalledWith(blob);
      expect(clickSpy).toHaveBeenCalledOnce();
      await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url'));
      // The menu closes on a successful download.
      await waitFor(() => expect(screen.queryByRole('button', { name: 'download file' })).toBeNull());

      clickSpy.mockRestore();
    });

    it('surfaces a typed error in the menu (never a silent no-op) and keeps it open to retry', async () => {
      const exportArtifact = vi.fn(async () => {
        throw new Error('artifact not found: art_5f21c9d0e83a');
      });
      render(<DetailSlot record={RECORD} client={fakeClient({ exportArtifact })} onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Download' }));
      fireEvent.click(screen.getByRole('button', { name: 'download file' }));

      await waitFor(() => expect(screen.getByText(/artifact not found/i)).toBeInTheDocument());
      // The menu is still open and the row is clickable again — a failed
      // export never silently closes the only path to retry it.
      expect(screen.getByRole('button', { name: 'download file' })).not.toBeDisabled();
      expect(screen.getByRole('button', { name: 'copy link to artifact' })).toBeInTheDocument();
    });

    it('copies the real export URL to the clipboard, not a fabricated link', async () => {
      const writeText = vi.fn(async (_text: string) => {});
      Object.assign(navigator, { clipboard: { writeText } });
      render(<DetailSlot record={RECORD} client={fakeClient()} onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Download' }));
      fireEvent.click(screen.getByRole('button', { name: 'copy link to artifact' }));

      await waitFor(() =>
        expect(writeText).toHaveBeenCalledWith(`http://localhost:7777/v1/artifacts/${RECORD.id}/export`),
      );
      expect(await screen.findByRole('button', { name: 'copied' })).toBeInTheDocument();
    });

    it('toggles closed on a second click of the Download button', () => {
      render(<DetailSlot record={RECORD} client={fakeClient()} onClose={vi.fn()} />);
      const download = screen.getByRole('button', { name: 'Download' });
      fireEvent.click(download);
      expect(screen.getByRole('button', { name: 'download file' })).toBeInTheDocument();
      fireEvent.click(download);
      expect(screen.queryByRole('button', { name: 'download file' })).toBeNull();
    });
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

  describe('storage row (round-3 defect 3 — prototype `storage <path> ↗` / artLoc)', () => {
    const stored = { ...RECORD, storagePath: 'data/earthscope_stations.csv', workspaceId: 'ws_1' };

    it('renders the persistent storage row with the REAL version path under the meta line', () => {
      render(<DetailSlot record={stored} onClose={vi.fn()} />);
      const row = screen.getByTestId('detail-storage');
      expect(row).toHaveTextContent('storage');
      expect(row).toHaveTextContent('data/earthscope_stations.csv');
    });

    it('opens the workspace files layer via the separate ↗ affordance when a handler is threaded (owner redesign 2026-08-05: onOpenStorage wiring preserved exactly)', () => {
      const onOpenStorage = vi.fn();
      render(<DetailSlot record={stored} onOpenStorage={onOpenStorage} onClose={vi.fn()} />);
      const openBtn = screen.getByTestId('detail-storage-open');
      expect(openBtn.tagName).toBe('BUTTON');
      fireEvent.click(openBtn);
      expect(onOpenStorage).toHaveBeenCalledWith({
        path: 'data/earthscope_stations.csv',
        workspaceId: 'ws_1',
      });
    });

    it('omits the ↗ affordance without a handler — never a dead affordance — but the path stays copyable', () => {
      render(<DetailSlot record={stored} onClose={vi.fn()} />);
      expect(screen.queryByTestId('detail-storage-open')).toBeNull();
      expect(screen.getByTestId('detail-storage-copy')).toBeInTheDocument();
    });

    it('clicking the path copies the full path to the clipboard, with a transient "copied" swap — the ↗ open control is untouched', async () => {
      const writeText = vi.fn(async (_text: string) => {});
      Object.assign(navigator, { clipboard: { writeText } });
      const onOpenStorage = vi.fn();
      render(<DetailSlot record={stored} onOpenStorage={onOpenStorage} onClose={vi.fn()} />);
      fireEvent.click(screen.getByTestId('detail-storage-copy'));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith('data/earthscope_stations.csv'));
      await waitFor(() => expect(screen.getByTestId('detail-storage-copy')).toHaveTextContent('copied'));
      expect(onOpenStorage).not.toHaveBeenCalled();
    });

    it('on a clipboard failure, shows the full path selected instead of pretending it copied', async () => {
      const writeText = vi.fn(async () => {
        throw new Error('clipboard permission denied');
      });
      Object.assign(navigator, { clipboard: { writeText } });
      render(<DetailSlot record={stored} onClose={vi.fn()} />);
      fireEvent.click(screen.getByTestId('detail-storage-copy'));
      await waitFor(() =>
        expect(screen.getByTestId('detail-storage-copy')).toHaveTextContent('data/earthscope_stations.csv'),
      );
      expect(screen.getByTestId('detail-storage-copy')).not.toHaveTextContent('copied');
    });

    it('truncates a long storage path from the middle, with the full path on hover and copied in full', async () => {
      const longPath = `workspaces/ws_1/${'nested/'.repeat(10)}report.md`;
      const writeText = vi.fn(async (_text: string) => {});
      Object.assign(navigator, { clipboard: { writeText } });
      render(<DetailSlot record={{ ...RECORD, storagePath: longPath }} onClose={vi.fn()} />);
      const pathBtn = screen.getByTestId('detail-storage-copy');
      expect(pathBtn.textContent).not.toBe(longPath);
      expect(pathBtn.textContent).toContain('…');
      expect(pathBtn).toHaveAttribute('title', longPath);
      fireEvent.click(pathBtn);
      await waitFor(() => expect(writeText).toHaveBeenCalledWith(longPath));
    });

    it('renders no storage row at all when the record carries no path', () => {
      render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
      expect(screen.queryByTestId('detail-storage')).toBeNull();
    });
  });

  describe('minting the storage fields from the real version wire', () => {
    it('mints storagePath and workspaceId from the version wire path/workspace_id', () => {
      const wireRecord = {
        workspace_id: 'ws_eacd',
        name: 'MTA1_LA_GNSS_report.md',
        kind: 'report',
        versions: [],
      } as unknown as SessionArtifactRecord;
      const version = {
        artifact_id: 'artifact_56ff',
        workspace_id: 'ws_eacd',
        name: 'MTA1_LA_GNSS_report.md',
        version: 1,
        kind: 'report',
        path: 'MTA1_LA_GNSS_report.md',
      } as unknown as SessionArtifactVersion;
      const minted = mintArtifactRecord(wireRecord, version);
      expect(minted.storagePath).toBe('MTA1_LA_GNSS_report.md');
      expect(minted.workspaceId).toBe('ws_eacd');
    });

    it('mints ONLY the honest custody_gap → gap transform status, never a guessed contract', () => {
      const wireRecord = { name: 'a', versions: [] } as unknown as SessionArtifactRecord;
      const clean = mintArtifactRecord(wireRecord, {
        artifact_id: 'artifact_1',
        name: 'a',
        version: 1,
      } as unknown as SessionArtifactVersion);
      expect(clean.transformStatus).toBeUndefined();
      const gapped = mintArtifactRecord(wireRecord, {
        artifact_id: 'artifact_2',
        name: 'a',
        version: 2,
        custody_gap: 'workspace file changed underneath the record',
      } as unknown as SessionArtifactVersion);
      expect(gapped.transformStatus).toBe('gap');
    });
  });

  describe('routeFromLineage (provenance rework — typed node facts + clusters + joins)', () => {
    /** Mockup 2's wire: the CSV minted by a foreign session feeds the PNG. */
    const CROSS_GRAPH: LineageGraph = {
      root: 'artifact_png01',
      nodes: [
        {
          id: 'artifact_png01',
          type: 'artifact',
          name: 'MTA1.CI.LY_.30_position.png',
          version: 1,
          producer_call_id: 'call_plot',
        },
        {
          id: 'activity:call_plot',
          type: 'activity',
          call_id: 'call_plot',
          tool: 'plot_plot_timeseries',
          status: 'success',
          replay: 're-runnable',
          session_id: 'sess_c6241fc8906f',
          turn_id: 'turn_9',
        },
        {
          id: 'artifact_csv01',
          type: 'artifact',
          name: 'MTA1.CI.LY_.30.csv',
          version: 1,
          producer_call_id: 'call_stage',
        },
        {
          id: 'activity:call_stage',
          type: 'activity',
          call_id: 'call_stage',
          tool: 'ndp_stage_resource',
          status: 'success',
          replay: 're-runnable',
          session_id: 'sess_9f17aa20bb31',
          turn_id: 'turn_2',
        },
      ],
      edges: [
        { from: 'activity:call_plot', to: 'artifact_png01', type: 'generated', evidence: 'hashed-at-use' },
        { from: 'artifact_csv01', to: 'activity:call_plot', type: 'used', evidence: 'hashed-at-use' },
        { from: 'activity:call_stage', to: 'artifact_csv01', type: 'generated', evidence: 'hashed-at-use' },
      ],
    };

    const CONTEXT = {
      viewerSessionId: 'sess_c6241fc8906f',
      versionsById: new Map<string, SessionArtifactVersion>([
        [
          'artifact_csv01',
          {
            artifact_id: 'artifact_csv01',
            name: 'MTA1.CI.LY_.30.csv',
            version: 1,
            size_bytes: 52_848_230,
            created_at: '2026-08-05T12:43:00',
          } as unknown as SessionArtifactVersion,
        ],
        [
          'artifact_png01',
          {
            artifact_id: 'artifact_png01',
            name: 'MTA1.CI.LY_.30_position.png',
            version: 1,
            size_bytes: 183_296,
          } as unknown as SessionArtifactVersion,
        ],
      ]),
    };

    it('flattens Mockup 2\'s wire oldest-first with the self artifact LAST', () => {
      const steps = routeFromLineage(CROSS_GRAPH, CONTEXT);
      const kinds = steps.map((s) => (s.kind === 'node' ? `${s.nodeType}:${s.label}` : `edge:${s.edge}`));
      expect(kinds).toEqual([
        'activity:ndp_stage_resource',
        'edge:generated',
        'artifact:MTA1.CI.LY_.30.csv',
        'edge:used',
        'activity:plot_plot_timeseries',
        'edge:generated',
        'artifact:MTA1.CI.LY_.30_position.png',
      ]);
      const last = steps[steps.length - 1]!;
      expect(last.kind === 'node' && last.self).toBe(true);
    });

    it('threads size/created_at from the version wire and the producing session from the producer activity', () => {
      const steps = routeFromLineage(CROSS_GRAPH, CONTEXT);
      const csv = steps.find((s) => s.kind === 'node' && s.label === 'MTA1.CI.LY_.30.csv');
      expect(csv).toMatchObject({
        artifactId: 'artifact_csv01',
        version: 'v1',
        size: '50.4 MB',
        createdAt: '2026-08-05T12:43:00',
        sessionId: 'sess_9f17aa20bb31',
        foreignSession: true,
      });
      const stage = steps.find((s) => s.kind === 'node' && s.label === 'ndp_stage_resource');
      expect(stage).toMatchObject({
        nodeType: 'activity',
        tool: 'ndp_stage_resource',
        sessionId: 'sess_9f17aa20bb31',
        turnId: 'turn_2',
        foreignSession: true,
      });
      // The viewing session's own nodes are NOT marked foreign.
      const plot = steps.find((s) => s.kind === 'node' && s.label === 'plot_plot_timeseries');
      expect(plot && 'foreignSession' in plot && plot.foreignSession).toBeFalsy();
    });

    it('the re-runnable replay default is plain-ok (no pill); failed and reproducible surface', () => {
      const steps = routeFromLineage(CROSS_GRAPH, CONTEXT);
      const plot = steps.find((s) => s.kind === 'node' && s.label === 'plot_plot_timeseries');
      expect(plot && 'status' in plot ? plot.status : undefined).toBeUndefined();

      const variant: LineageGraph = {
        ...CROSS_GRAPH,
        nodes: CROSS_GRAPH.nodes.map((n) =>
          n.id === 'activity:call_plot'
            ? { ...n, replay: 'reproducible' }
            : n.id === 'activity:call_stage'
              ? { ...n, status: 'failed' }
              : n,
        ),
      };
      const vSteps = routeFromLineage(variant, CONTEXT);
      const vPlot = vSteps.find((s) => s.kind === 'node' && s.label === 'plot_plot_timeseries');
      expect(vPlot && 'status' in vPlot ? vPlot.status : undefined).toBe('reproducible');
      const vStage = vSteps.find((s) => s.kind === 'node' && s.label === 'ndp_stage_resource');
      expect(vStage && 'status' in vStage ? vStage.status : undefined).toBe('failed');
    });

    it('a multi-input graph keeps EVERY used edge, marking non-adjacent consumers as joins (Mockup 3)', () => {
      const graph: LineageGraph = {
        root: 'artifact_report',
        nodes: [
          { id: 'artifact_report', type: 'artifact', name: 'report.md', version: 1, producer_call_id: 'call_create' },
          { id: 'activity:call_create', type: 'activity', call_id: 'call_create', tool: 'create_artifact', session_id: 'sess_c6241fc8906f' },
          { id: 'artifact_a', type: 'artifact', name: 'a.csv', version: 1 },
          { id: 'artifact_b', type: 'artifact', name: 'b.png', version: 1 },
        ],
        edges: [
          { from: 'activity:call_create', to: 'artifact_report', type: 'generated', evidence: 'hashed-at-use' },
          { from: 'artifact_a', to: 'activity:call_create', type: 'used', evidence: 'declared' },
          { from: 'artifact_b', to: 'activity:call_create', type: 'used', evidence: 'declared' },
        ],
      };
      const steps = routeFromLineage(graph, { viewerSessionId: 'sess_c6241fc8906f' });
      const edges = steps.filter((s) => s.kind === 'edge');
      // BOTH used edges survive the flattening (the old walk dropped
      // non-adjacent ones), plus the generated edge: 3 total.
      expect(edges).toHaveLength(3);
      expect(edges.filter((e) => e.edge === 'used')).toHaveLength(2);
      // Exactly one of the two inputs is non-adjacent to the activity — its
      // edge carries the join elbow; the adjacent one does not.
      expect(edges.filter((e) => e.edge === 'used' && e.join)).toHaveLength(1);
      // Every node still renders exactly once.
      expect(steps.filter((s) => s.kind === 'node')).toHaveLength(4);
    });

    it('falls back to the generated edge for the producing session when producer_call_id names a call outside the graph (observed live on sess_c6241fc8906f)', () => {
      const graph: LineageGraph = {
        ...CROSS_GRAPH,
        nodes: CROSS_GRAPH.nodes.map((n) =>
          n.id === 'artifact_csv01' ? { ...n, producer_call_id: 'call_redesignated' } : n,
        ),
      };
      const steps = routeFromLineage(graph, CONTEXT);
      const csv = steps.find((s) => s.kind === 'node' && s.label === 'MTA1.CI.LY_.30.csv');
      // The generated edge activity:call_stage → csv still proves the
      // producing session; the node clusters as foreign instead of silently
      // dropping into the default context.
      expect(csv).toMatchObject({ sessionId: 'sess_9f17aa20bb31', foreignSession: true });
    });

    it('never fabricates size/duration/session facts the wires do not carry', () => {
      const steps = routeFromLineage(CROSS_GRAPH, {});
      const csv = steps.find((s) => s.kind === 'node' && s.label === 'MTA1.CI.LY_.30.csv');
      expect(csv && 'size' in csv ? csv.size : undefined).toBeUndefined();
      const plot = steps.find((s) => s.kind === 'node' && s.label === 'plot_plot_timeseries');
      expect(plot && 'duration' in plot ? plot.duration : undefined).toBeUndefined();
      // Without a viewer session nothing is marked foreign.
      expect(steps.every((s) => s.kind === 'edge' || !s.foreignSession)).toBe(true);
    });
  });

  describe('content preview rendering (round-3 defect 2, component half)', () => {
    it('renders a markdown preview body on the Overview once the record carries one', () => {
      render(
        <DetailSlot
          record={{
            ...RECORD,
            preview: { kind: 'markdown', text: '# EarthScope GNSS Report\n\nStation MTA1 body text.' },
          }}
          onClose={vi.fn()}
        />,
      );
      const preview = screen.getByTestId('detail-preview-markdown');
      expect(preview).toHaveTextContent('EarthScope GNSS Report');
      expect(preview).toHaveTextContent('Station MTA1 body text.');
    });

    it('renders no preview section while the record has none (loading or unfetchable)', () => {
      const { container } = render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
      expect(container.querySelector('[data-testid^="detail-preview"]')).toBeNull();
    });
  });

  describe('compact provenance line (provenance rework — the KvGrid is deleted)', () => {
    it('renders the four axes as ONE dot-separated muted line under the tab strip', () => {
      render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('tab', { name: /provenance/i }));
      const line = screen.getByTestId('detail-prov-line');
      expect(line.textContent).toBe('harness·tool-declared·hashed-at-use·workspace — data/');
    });

    it('states a missing axis as unrecorded on the line, never omits it', () => {
      const record = { ...RECORD };
      delete (record as { evidence?: string }).evidence;
      render(<DetailSlot record={record} onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('tab', { name: /provenance/i }));
      expect(screen.getByTestId('detail-prov-line')).toHaveTextContent('unrecorded');
    });

    it('renders NO KvGrid and NO record folds on the provenance tab (the deletions)', () => {
      const { container } = render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('tab', { name: /provenance/i }));
      const prov = screen.getByTestId('detail-provenance');
      expect(prov.querySelector('.kit-kvgrid')).toBeNull();
      expect(screen.queryByRole('button', { name: /version record/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /transform record/i })).toBeNull();
      expect(container.querySelector('.detail__fold')).toBeNull();
    });
  });

  describe('one-line lineage graph (docs/design/provenance-graph-2026-08.md)', () => {
    it('names the chain eyebrow "lineage", not "route"', () => {
      render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('tab', { name: /provenance/i }));
      expect(screen.getByText('lineage')).toBeInTheDocument();
      expect(screen.queryByText('route')).toBeNull();
    });

    it('renders every step in order: one line per node, connector lines between', () => {
      render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('tab', { name: /provenance/i }));
      const steps = screen.getAllByTestId(/route-(node|edge)/);
      expect(steps).toHaveLength(5);
      expect(steps[1]).toHaveTextContent('used');
      expect(steps[1]).toHaveTextContent('authority-asserted');
      expect(steps[3]).toHaveTextContent('generated');
    });

    it('an artifact node is ONE line: ◆ glyph + name + version/size sub-info, no bordered kv rows', () => {
      render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('tab', { name: /provenance/i }));
      const self = screen.getByTestId('route-node-self');
      expect(self.querySelector('.detail__lglyph')).toHaveTextContent('◆');
      expect(self.querySelector('.detail__lname')).toHaveTextContent('earthscope_stations.csv');
      expect(self).toHaveTextContent('v1');
      expect(self).toHaveTextContent('48 KB');
      // Never the old column-width rectangle grammar.
      expect(self.querySelector('.detail__nodetype')).toBeNull();
    });

    it('an activity node renders ⚙ + tool + duration on its line', () => {
      render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('tab', { name: /provenance/i }));
      const activity = screen.getByTestId('route-node-2');
      expect(activity.querySelector('.detail__lglyph')).toHaveTextContent('⚙');
      expect(activity).toHaveTextContent('stage_resource');
      expect(activity).toHaveTextContent('4.2s');
    });

    it('an activity line carries its status pill when not plain-ok', () => {
      const route: RouteStep[] = [
        {
          kind: 'node',
          nodeType: 'activity',
          label: 'create_artifact',
          tool: 'create_artifact',
          status: 'gap',
        },
      ];
      render(<DetailSlot record={{ ...RECORD, route }} onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('tab', { name: /provenance/i }));
      const pill = screen.getByTestId('route-node-0').querySelector('.detail__lpill');
      expect(pill).toHaveTextContent('gap');
      expect(pill).toHaveAttribute('data-status', 'gap');
    });

    it('a gap node renders ▢ with its reason, muted', () => {
      const route: RouteStep[] = [
        { kind: 'node', nodeType: 'gap', label: 'report.md', gapReason: 'no transform recorded' },
      ];
      render(<DetailSlot record={{ ...RECORD, route }} onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('tab', { name: /provenance/i }));
      const gap = screen.getByTestId('route-node-0');
      expect(gap.querySelector('.detail__lglyph')).toHaveTextContent('▢');
      expect(gap).toHaveTextContent('no transform recorded');
    });

    it('marks the record itself with the you-are-here marker on its own line', () => {
      render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('tab', { name: /provenance/i }));
      const self = screen.getByTestId('route-node-self');
      expect(self).toHaveTextContent('you are here');
      expect(self).toHaveAttribute('data-self', 'true');
    });

    it('a join edge (multi-input branch) draws the ╮ elbow toward its consumer', () => {
      const route: RouteStep[] = [
        { kind: 'node', nodeType: 'artifact', label: 'a.csv', artifactId: 'artifact_a' },
        { kind: 'edge', edge: 'used', stance: 'declared', join: true },
        { kind: 'node', nodeType: 'artifact', label: 'b.csv', artifactId: 'artifact_b' },
        { kind: 'edge', edge: 'used', stance: 'declared' },
        { kind: 'node', nodeType: 'activity', label: 'create_artifact' },
      ];
      render(<DetailSlot record={{ ...RECORD, route }} onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('tab', { name: /provenance/i }));
      const joined = screen.getByTestId('route-edge-1');
      expect(joined).toHaveAttribute('data-join', 'true');
      expect(joined).toHaveTextContent('╮');
      expect(screen.getByTestId('route-edge-3')).not.toHaveAttribute('data-join');
    });

    it('a non-self artifact line opens that artifact in the panel (push) on click', () => {
      const onOpenArtifact = vi.fn();
      render(
        <DetailSlot
          record={{ ...RECORD, route: CROSS_SESSION_ROUTE }}
          onOpenArtifact={onOpenArtifact}
          onClose={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByRole('tab', { name: /provenance/i }));
      const csv = screen.getByTestId('route-node-2');
      expect(csv.tagName).toBe('BUTTON');
      fireEvent.click(csv);
      expect(onOpenArtifact).toHaveBeenCalledWith('artifact_csv01');
    });

    it('the self line is never a click affordance, even with the callback threaded', () => {
      const onOpenArtifact = vi.fn();
      render(
        <DetailSlot
          record={{ ...RECORD, route: CROSS_SESSION_ROUTE }}
          onOpenArtifact={onOpenArtifact}
          onClose={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByRole('tab', { name: /provenance/i }));
      const self = screen.getByTestId('route-node-self');
      expect(self.tagName).not.toBe('BUTTON');
      fireEvent.click(self);
      expect(onOpenArtifact).not.toHaveBeenCalled();
    });

    it('an activity line jumps to its producing session on click', () => {
      const onOpenSession = vi.fn();
      render(
        <DetailSlot
          record={{ ...RECORD, route: CROSS_SESSION_ROUTE }}
          onOpenSession={onOpenSession}
          onClose={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByRole('tab', { name: /provenance/i }));
      const activity = screen.getByTestId('route-node-0');
      expect(activity.tagName).toBe('BUTTON');
      fireEvent.click(activity);
      expect(onOpenSession).toHaveBeenCalledWith('sess_9f17aa20bb31');
    });

    it('lines render inert (no button, no fake affordance) without the callbacks', () => {
      render(<DetailSlot record={{ ...RECORD, route: CROSS_SESSION_ROUTE }} onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('tab', { name: /provenance/i }));
      expect(screen.getByTestId('route-node-0').tagName).not.toBe('BUTTON');
      expect(screen.getByTestId('route-node-2').tagName).not.toBe('BUTTON');
    });
  });

  describe('foreign session clusters (cross-session lineage, gact-tui#355)', () => {
    it('groups a foreign session\'s nodes under a clickable one-line cluster header', () => {
      const onOpenSession = vi.fn();
      render(
        <DetailSlot
          record={{ ...RECORD, route: CROSS_SESSION_ROUTE }}
          onOpenSession={onOpenSession}
          onClose={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByRole('tab', { name: /provenance/i }));
      const cluster = screen.getByTestId('route-cluster');
      expect(cluster).toHaveAttribute('data-session', 'sess_9f17aa20bb31');
      const header = screen.getByTestId('route-cluster-header');
      expect(header.tagName).toBe('BUTTON');
      expect(header).toHaveTextContent('sess_9f17…');
      expect(header).toHaveTextContent('↗');
      // The header carries the cluster's mint time from the version wire.
      expect(header).toHaveTextContent('05 Aug 12:43');
      fireEvent.click(header);
      expect(onOpenSession).toHaveBeenCalledWith('sess_9f17aa20bb31');
    });

    it('the foreign cluster owns its nodes AND internal edges behind the dimmed ┆ rail; the joining used edge stays outside', () => {
      render(<DetailSlot record={{ ...RECORD, route: CROSS_SESSION_ROUTE }} onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('tab', { name: /provenance/i }));
      const cluster = screen.getByTestId('route-cluster');
      // ndp_stage_resource + generated edge + the csv are INSIDE the cluster…
      expect(within(cluster).getByTestId('route-node-0')).toBeInTheDocument();
      expect(within(cluster).getByTestId('route-edge-1')).toBeInTheDocument();
      expect(within(cluster).getByTestId('route-node-2')).toBeInTheDocument();
      // …each behind the dimmed rail glyph…
      expect(within(cluster).getByTestId('route-node-0').querySelector('.detail__lrail')).toHaveTextContent('┆');
      expect(within(cluster).getByTestId('route-edge-1').querySelector('.detail__lrail')).toHaveTextContent('┆');
      // …while the used edge INTO the viewing session's activity, and
      // everything after it, sit outside the cluster (no rail).
      expect(within(cluster).queryByTestId('route-edge-3')).toBeNull();
      expect(within(cluster).queryByTestId('route-node-4')).toBeNull();
      expect(screen.getByTestId('route-edge-3').querySelector('.detail__lrail')).toBeNull();
      expect(screen.getByTestId('route-node-self').querySelector('.detail__lrail')).toBeNull();
    });

    it('the viewing session\'s own nodes render with NO cluster header (default context)', () => {
      render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('tab', { name: /provenance/i }));
      expect(screen.queryByTestId('route-cluster')).toBeNull();
      expect(screen.queryByTestId('route-cluster-header')).toBeNull();
    });

    it('without onOpenSession the header renders as a plain line without the ↗ — never a dead affordance', () => {
      render(<DetailSlot record={{ ...RECORD, route: CROSS_SESSION_ROUTE }} onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('tab', { name: /provenance/i }));
      const header = screen.getByTestId('route-cluster-header');
      expect(header.tagName).not.toBe('BUTTON');
      expect(header.textContent).not.toContain('↗');
    });
  });

  describe('recreate replay pill (the deleted TRANSFORM RECORD fold\'s pill, rehomed)', () => {
    it('carries the replay-contract pill on the recreate tab when the record has one', () => {
      render(
        <DetailSlot record={{ ...RECORD, transformStatus: 'reproducible' }} onClose={vi.fn()} />,
      );
      fireEvent.click(screen.getByRole('tab', { name: /recreate/i }));
      const pill = screen.getByTestId('recreate-status');
      expect(pill).toHaveTextContent('reproducible');
      expect(pill).toHaveAttribute('data-status', 'reproducible');
    });

    it('shows NO pill when the record carries no replay contract — absence, not a guess', () => {
      render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('tab', { name: /recreate/i }));
      expect(screen.queryByTestId('recreate-status')).toBeNull();
    });
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
      fireEvent.click(screen.getByRole('button', { name: /collapse artifact panel/i }));
      // The full panel's tabs/body are gone — only the strip remains.
      expect(screen.queryByRole('tab', { name: /artifact/i })).toBeNull();
      expect(screen.getByRole('complementary', { name: /detail \(collapsed\)/i })).toBeInTheDocument();
      const expandBtn = screen.getByRole('button', { name: /expand panel/i });
      expect(expandBtn).toHaveTextContent('‹');
      expect(screen.getByText('ARTIFACT')).toBeInTheDocument();
    });

    it('re-expands the full panel from the strip', () => {
      render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /collapse artifact panel/i }));
      fireEvent.click(screen.getByRole('button', { name: /expand panel/i }));
      expect(screen.getByRole('tab', { name: /artifact/i })).toBeInTheDocument();
      expect(screen.getByTestId('detail-title')).toHaveTextContent('art_5f21c9d0e83a');
    });

    it('uses a DIFFERENT icon geometry than the rail collapse control (divider at x=8.6, not x=5.4)', () => {
      render(<DetailSlot record={RECORD} onClose={vi.fn()} />);
      const collapseBtn = screen.getByRole('button', { name: /collapse artifact panel/i });
      expect(collapseBtn.querySelector('[data-icon="panel-right"]')).not.toBeNull();
    });
  });
});
