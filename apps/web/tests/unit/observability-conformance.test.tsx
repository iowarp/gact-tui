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
import { describe, expect, it } from 'vitest';
import { Observability } from '../../src/observability/Observability';
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
    },
  ],
} as unknown as ObservabilityData;

function renderObs() {
  return render(<Observability data={DATA} />);
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
});

describe('trace header', () => {
  it('states the scope and liveness: session trace · live', () => {
    renderObs();
    const trace = screen.getByTestId('obs-trace');
    expect(trace.textContent).toMatch(/session trace/);
    expect(trace.textContent).toMatch(/live/);
  });
});
