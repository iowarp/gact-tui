/**
 * Provenance-regrammar bench (owner sketch, 2026-08-06).
 *
 * Mounts the REAL `DetailSlot` on the REAL EarthScope route — the wire payload
 * captured read-only from 127.0.0.1:17900 in `earthscopeLineage.ts` — so the
 * before/after screenshots show the shipping component rendering the shipping
 * data, never a mock of it. It is a probe, not app surface: it lives under
 * scripts/, has its own vite config and port, and is never an entry of the
 * production build.
 *
 * Run: npx vite --config scripts/viz-shots/vite.config.mts   (port 4194)
 *      then open /prov.html, or: node scripts/viz-shots/shoot-prov.mjs
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DetailSlot } from '../../src/detail/DetailSlot';
import type { ArtifactRecord } from '../../src/detail/types';
import {
  EARTHSCOPE_SESSION_TITLES,
  PNG_ID,
  earthscopeRoute,
} from './earthscopeLineage';
import '../../src/styles/tokens.css';
import '../../src/styles/base.css';

const record: ArtifactRecord = {
  id: PNG_ID,
  recordKind: 'artifact',
  breadcrumb: ['session', 'earthscope_station_distribution.png'],
  kind: 'image',
  size: '879 KB',
  sha: '636b40ac793dfa343b600fb644b76859dcef5f7ccf1cd4be961672ac57b1f0db',
  mechanism: 'tool-schema',
  designation: 'tool-arg',
  evidence: 'hashed-at-use',
  custody: 'cas',
  revision: 'v1',
  instrument: 'plot_plot_timeseries(output_path="earthscope_station_distribution.png")',
  transformStatus: 'reproducible',
  route: earthscopeRoute(),
  sessionTitles: EARTHSCOPE_SESSION_TITLES,
};

function Bench() {
  return (
    <div style={{ padding: '18px', display: 'flex', gap: '18px', alignItems: 'flex-start' }}>
      <div
        id="bench-detail"
        style={{
          width: '340px',
          height: '820px',
          background: 'var(--t-sf)',
          border: '1px solid var(--t-bd2)',
          borderRadius: '10px',
          overflow: 'hidden',
        }}
      >
        <DetailSlot
          record={record}
          onClose={() => {}}
          onOpenSession={() => {}}
          onOpenArtifact={() => {}}
        />
      </div>
      <div
        id="bench-wide"
        style={{
          width: '860px',
          height: '820px',
          background: 'var(--t-sf)',
          border: '1px solid var(--t-bd2)',
          borderRadius: '10px',
          overflow: 'hidden',
        }}
      >
        <DetailSlot
          record={record}
          onClose={() => {}}
          onOpenSession={() => {}}
          onOpenArtifact={() => {}}
        />
      </div>
    </div>
  );
}

const host = document.getElementById('root');
if (!host) throw new Error('#root missing');
createRoot(host).render(
  <StrictMode>
    <Bench />
  </StrictMode>,
);
