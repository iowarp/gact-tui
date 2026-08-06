/**
 * P5-4 failing-first contract — the observability panel (gact-tui#347).
 *
 * Prototype truth (proto-obs-0.png, proto-obs-gantt.png, proto-obs.json,
 * walk-artifacts-panel.png): tabs `timeline · runs N · tools N · artifacts N
 * · context` with timeline FIRST and active; timeline carries a log|gantt
 * toggle and the legend `event / tool / artifact / failure / running`; log
 * rows are `HH:MM actor action (duration)` with teal artifact rows; the
 * gantt renders hierarchical rows with duration bars, running bars accented,
 * artifact diamonds; the artifacts tab rows carry producer paths. Wire
 * sources: memory/events + semantic feed, agent-tasks, runs, artifacts.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Observability, type ObservabilityProps } from '../../src/observability/Observability';
import type { ObservabilityData } from '../../src/observability/types';

/** Captured-shape fixture: two completed spans + one running, one artifact. */
const DATA = {
  agents: [],
  runs: [],
  toolsByExpert: {},
  artifacts: [],
  timeline: [
    {
      at: '19:52',
      actor: 'user',
      action: '"What recent ground-motion…"',
      kind: 'event',
    },
    {
      at: '19:53',
      actor: 'geo_geocode',
      action: 'tool call',
      duration: '2.8s',
      kind: 'tool',
    },
    {
      at: '19:55',
      actor: 'earthscope_stations.csv',
      action: 'artifact (1,101 rows)',
      kind: 'artifact',
    },
  ],
  spans: [
    {
      id: 'sp1',
      label: 'main · turn 1',
      depth: 0,
      startMs: 0,
      endMs: 540000,
      state: 'done',
      duration: '9m',
    },
    {
      id: 'sp2',
      label: 'geospatial',
      depth: 1,
      startMs: 10000,
      endMs: 70000,
      state: 'done',
      duration: '1m',
      artifacts: 0,
    },
    {
      id: 'sp3',
      label: 'data',
      depth: 1,
      startMs: 80000,
      endMs: 320000,
      state: 'done',
      duration: '4m',
      artifacts: 1,
    },
    {
      id: 'sp4',
      label: 'main · turn 2',
      depth: 0,
      startMs: 700000,
      endMs: null,
      state: 'running',
    },
  ],
  artifactRows: [
    {
      at: '19:55',
      name: 'earthscope_stations.csv',
      producer: 'data / ndp_dataset_discovery',
      meta: '1,101 rows',
      id: 'art_5f21c9d0e83a',
    },
  ],
} as unknown as ObservabilityData;

function renderObs(overrides: Partial<ObservabilityProps> = {}) {
  return render(<Observability data={DATA} {...overrides} />);
}

describe('tab set (prototype order + counts)', () => {
  it('leads with timeline; counts ride the tab labels; no agents tab', () => {
    renderObs();
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent?.trim());
    expect(tabs[0]).toMatch(/^timeline/);
    expect(tabs).toContainEqual(expect.stringMatching(/^artifacts\s*1$/));
    expect(tabs.join(' ')).not.toMatch(/agents/);
    expect(screen.getAllByRole('tab')[0]?.getAttribute('aria-selected')).toBe('true');
  });
});

describe('timeline (log + gantt)', () => {
  it('offers the log|gantt toggle and the five-glyph legend', () => {
    renderObs();
    expect(screen.getByRole('button', { name: /^log$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^gantt$/i })).toBeInTheDocument();
    const legend = screen.getByTestId('obs-legend');
    for (const term of ['event', 'tool', 'artifact', 'failure', 'running']) {
      expect(legend.textContent).toContain(term);
    }
  });

  it('renders log rows as time · actor · action with artifact rows marked', () => {
    const { container } = renderObs();
    const rows = container.querySelectorAll('.obs-log__row');
    expect(rows.length).toBe(3);
    expect(rows[0]!.textContent).toContain('19:52');
    expect(rows[1]!.textContent).toContain('(2.8s)');
    expect(rows[2]!.getAttribute('data-kind')).toBe('artifact');
  });

  it('puts the duration INLINE in the action text, not a separate trailing column (P5-4, gact-tui#347)', () => {
    const { container } = renderObs();
    const rows = container.querySelectorAll('.obs-log__row');
    const toolRow = rows[1]!;
    // No standalone duration element any more.
    expect(toolRow.querySelector('.obs-log__duration')).toBeNull();
    // The action cell itself carries the "tool call (2.8s)" text.
    const action = toolRow.querySelector('.obs-log__action')!;
    expect(action.textContent).toBe('tool call (2.8s)');
  });

  it('gantt renders hierarchical bars, running accented, artifact diamonds', () => {
    const { container } = renderObs();
    fireEvent.click(screen.getByRole('button', { name: /^gantt$/i }));
    const rows = container.querySelectorAll('.obs-gantt__row');
    expect(rows.length).toBe(4);
    expect(rows[1]!.getAttribute('data-depth')).toBe('1');
    const running = container.querySelector('.obs-gantt__bar[data-state="running"]');
    expect(running).not.toBeNull();
    // The data span carries an artifact diamond marker.
    const dataRow = [...rows].find((r) => r.textContent?.includes('data'))!;
    expect(dataRow.querySelector('.obs-gantt__artifact')).not.toBeNull();
    // Completed bars carry their duration labels.
    expect(container.textContent).toContain('9m');
  });
});

describe('artifacts tab (producer paths)', () => {
  it('lists artifacts as time · name · producer · size', () => {
    renderObs();
    fireEvent.click(screen.getByRole('tab', { name: /^artifacts/ }));
    const row = screen.getByTestId('obs-artifact-row');
    expect(row.textContent).toContain('earthscope_stations.csv');
    expect(row.textContent).toContain('data / ndp_dataset_discovery');
    expect(row.textContent).toContain('1,101 rows');
  });

  // P5-4 (gact-tui#347): the viewer exists (SessionView.openArtifactById ->
  // AppShell detail -> DetailSlot) — the rows were stale-disabled behind a
  // comment claiming otherwise. Wired through onOpenArtifact, the SAME
  // channel the transcript's artifact chips use (ArtifactChip's own
  // `onOpenArtifact && artifactId` gate).
  it('is a real enabled button that opens the artifact when onOpenArtifact is wired', () => {
    const onOpenArtifact = vi.fn();
    renderObs({ onOpenArtifact });
    fireEvent.click(screen.getByRole('tab', { name: /^artifacts/ }));
    const button = screen.getByTestId('obs-artifact-row').querySelector('button')!;
    expect(button).not.toBeDisabled();
    expect(button).not.toHaveAttribute('data-unbacked');
    fireEvent.click(button);
    expect(onOpenArtifact).toHaveBeenCalledWith('art_5f21c9d0e83a', 'earthscope_stations.csv');
  });

  it('renders honestly disabled and flagged when no onOpenArtifact is supplied — never a silent dead click', () => {
    renderObs();
    fireEvent.click(screen.getByRole('tab', { name: /^artifacts/ }));
    const button = screen.getByTestId('obs-artifact-row').querySelector('button')!;
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('data-unbacked', 'true');
  });
});

describe('artifacts tab — honest empty state (round-8 owner finding: this panel used to render blank)', () => {
  it('states plainly when a genuinely artifact-less, successfully-read session has none — never a silent blank panel', () => {
    render(
      <Observability
        data={{ ...DATA, artifacts: [], artifactRows: [] } as unknown as ObservabilityData}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: /^artifacts/ }));
    expect(screen.getByTestId('obs-empty')).toHaveTextContent(/no artifacts recorded/i);
    expect(screen.queryByTestId('obs-artifact-row')).toBeNull();
  });

  it('still shows the honest "unavailable" state (not the empty-state copy) when the read failed', () => {
    render(
      <Observability
        data={
          {
            ...DATA,
            artifacts: [],
            artifactRows: [],
            artifactsReadFailed: true,
          } as unknown as ObservabilityData
        }
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: /^artifacts/ }));
    expect(screen.getByTestId('obs-unavailable')).toHaveTextContent(/artifacts unavailable/i);
    expect(screen.queryByTestId('obs-empty')).toBeNull();
  });
});

describe('artifacts tab — artifact.used dedup-reuse rows (round-8 owner finding: reuse was invisible)', () => {
  const USED_ROW = {
    at: '19:56',
    name: 'earthscope_stations_clean.csv',
    producer: 'ndp #1',
    meta: 'v1 · dedup',
    id: 'art_used_1',
    used: true,
  };

  it('renders a used row distinctly tagged, alongside a minted row', () => {
    render(
      <Observability
        data={
          { ...DATA, artifactRows: [...(DATA.artifactRows ?? []), USED_ROW] } as unknown as ObservabilityData
        }
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: /^artifacts/ }));
    const rows = screen.getAllByTestId('obs-artifact-row');
    expect(rows).toHaveLength(2);
    const usedRow = rows.find((r) => r.textContent?.includes('earthscope_stations_clean.csv'))!;
    expect(usedRow).toHaveAttribute('data-used', 'true');
    expect(usedRow.textContent).toContain('used (dedup)');
    const mintedRow = rows.find((r) => r.textContent?.includes('earthscope_stations.csv'))!;
    expect(mintedRow).not.toHaveAttribute('data-used');
    expect(mintedRow.textContent).not.toContain('used (dedup)');
  });

  it('opens the same right-panel viewer as a minted row, through the same onOpenArtifact channel', () => {
    const onOpenArtifact = vi.fn();
    render(
      <Observability
        data={{ ...DATA, artifactRows: [USED_ROW] } as unknown as ObservabilityData}
        onOpenArtifact={onOpenArtifact}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: /^artifacts/ }));
    const button = screen.getByTestId('obs-artifact-row').querySelector('button')!;
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(onOpenArtifact).toHaveBeenCalledWith('art_used_1', 'earthscope_stations_clean.csv');
  });
});

/**
 * Round-9 owner finding: the transcript's own tool rows and the tools tab's
 * "available" inventory both render the wire's optional `tool_title`, but
 * the "called" log printed the raw tool name regardless — build.ts never
 * read the field. Same grammar as the transcript's own part-toolrow: bold
 * title + a separately-rendered, muted raw name (obs-toollog-rawname);
 * absent title falls through to exactly the old raw-name-only row.
 */
describe('tools tab "called" rows — tool_title (round-9 owner finding)', () => {
  const TOOL_CALLS = [
    {
      sourceId: 'call_1',
      at: '19:53',
      name: 'ndp_dataset_discovery',
      title: 'Discover datasets',
      agent: 'main',
      state: 'done',
      duration: '4.6s',
    },
    {
      sourceId: 'call_2',
      at: '19:54',
      name: 'geo_geocode',
      agent: 'main',
      state: 'done',
      duration: '2.8s',
    },
  ];

  it('renders the bold title with the muted raw name beside it when tool_title is present', () => {
    render(
      <Observability
        data={{ ...DATA, toolCalls: TOOL_CALLS } as unknown as ObservabilityData}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: /^tools/ }));
    const row = screen.getByText('Discover datasets').closest('.obs-toollog__row') as HTMLElement;
    expect(within(row).getByText('Discover datasets')).toHaveClass('obs-toollog__name');
    const rawname = within(row).getByTestId('obs-toollog-rawname');
    expect(rawname).toHaveTextContent('ndp_dataset_discovery');
    expect(rawname).toHaveClass('obs-toollog__rawname');
  });

  it('renders exactly the raw name alone when tool_title is absent — old sessions, unchanged', () => {
    render(
      <Observability
        data={{ ...DATA, toolCalls: TOOL_CALLS } as unknown as ObservabilityData}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: /^tools/ }));
    const row = screen.getByText('geo_geocode').closest('.obs-toollog__row') as HTMLElement;
    expect(within(row).queryByTestId('obs-toollog-rawname')).toBeNull();
    expect(within(row).getByText('geo_geocode')).toHaveClass('obs-toollog__name');
  });
});

describe('trace header', () => {
  it('states the scope and liveness: session trace · live', () => {
    renderObs();
    const trace = screen.getByTestId('obs-trace');
    expect(trace.textContent).toMatch(/session trace/);
    expect(trace.textContent).toMatch(/live/);
  });
});
