import { useState } from 'react';
import { AppShell } from './AppShell';
import type { RailGroup } from './Rail';

/**
 * Shell fixtures harness (`?shell`).
 *
 * Renders the shell against prototype-shaped data so it can be compared with
 * the render target. The data mirrors the prototype's own session list — it is
 * a FIXTURE, not backend output, and proves nothing about the live wire.
 */
const GROUPS: RailGroup[] = [
  {
    id: 'ws_j4471',
    label: '/scratch/j4471',
    count: 9,
    sessions: [
      { id: 'sess_la', title: 'LA ground motion · EarthScope GNSS', status: 'running', age: 'now' },
      { id: 'sess_ast', title: 'asteroid cut-plane render', status: 'idle', age: '4m' },
      { id: 'sess_tape', title: 'scratch cleanup + tape archive', status: 'running', age: 'now' },
      { id: 'sess_adios', title: 'adios2 engine bench', status: 'idle', age: '6d' },
      { id: 'sess_ior', title: 'ior baseline sweep', status: 'idle', age: '8d' },
    ],
  },
  {
    id: 'ws_hermes',
    label: '/scratch/hermes',
    count: 1,
    sessions: [{ id: 'sess_h1', title: 'hermes put/get microbench', status: 'queued', age: '2h' }],
  },
  {
    id: 'ws_rollups',
    label: '~/rollups',
    count: 1,
    sessions: [{ id: 'sess_r1', title: 'weekly rollup', status: 'error', age: '1d' }],
  },
];

export function ShellPreview() {
  const [active, setActive] = useState('sess_la');
  const [ribbon, setRibbon] = useState('main');

  return (
    <AppShell
      groups={GROUPS}
      activeSessionId={active}
      onSelectSession={setActive}
      title="LA ground motion · EarthScope GNSS"
      breadcrumb="earthscope-gnss-region"
      artifactCount={5}
      contextPercent={41}
      ribbon={[
        { id: 'main', label: 'main' },
        { id: 'geospatial', label: 'geospatial' },
        { id: 'data', label: 'data' },
      ]}
      activeRibbonId={ribbon}
      onSelectRibbon={setRibbon}
    >
      <div style={{ padding: '20px 24px', color: 'var(--t-mu)' }}>
        Transcript region — gact-tui#333.
      </div>
    </AppShell>
  );
}
