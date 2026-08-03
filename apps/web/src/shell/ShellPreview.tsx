import { useState } from 'react';
import type { Message } from '@clio/core';
import { Composer } from '../composer/Composer';
import { Transcript } from '../transcript/Transcript';
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

const MESSAGES = [
  {
    id: 'm_user',
    role: 'user',
    parts: [
      {
        type: 'text',
        text:
          "What recent ground-motion is EarthScope's GNSS network showing around Los Angeles? " +
          'Pull a real station time series, plot it, and tell me how much to trust the data.',
      },
    ],
  },
  {
    id: 'm_a1',
    role: 'assistant',
    parts: [
      {
        type: 'thinking',
        thinking:
          'The user wants recent ground motion around Los Angeles from EarthScope GNSS. ' +
          'I will spawn the geospatial child to resolve the place name into coordinates.',
        tokens: 77,
      },
      {
        type: 'text',
        text:
          'The request asks for the full pipeline: resolve Los Angeles, discover and stage a ' +
          'GNSS station CSV, profile it, then produce a PNG. Starting with the geospatial child.',
      },
      {
        type: 'expert_handoff',
        expert: 'geospatial',
        task_id: 'task_b7525159dde5',
        duration: '1m 12s',
        question:
          "Resolve 'Los Angeles, California' into a grounded region center and search radius.",
      },
      {
        type: 'subagent_result',
        expert: 'geospatial',
        duration: '1m 12s',
        excerpt:
          'Los Angeles resolves via OSM Nominatim to 34.0537° N, 118.2428° W, bbox ' +
          '[-118.668, 33.660, -118.155, 34.337]. Radius 100 km assumed as a conservative default.',
      },
      {
        type: 'tool_call',
        id: 'tc1',
        name: 'ndp_dataset_discovery',
        input: { center_lat: 34.0536909, center_lon: -118.242766, radius_km: 100 },
      },
      { type: 'routing_decision', expert: 'data' },
      { type: 'some_future_kind', payload: 1 },
    ],
  },
] as unknown as Message[];

export function ShellPreview() {
  const [active, setActive] = useState('sess_la');
  const [ribbon, setRibbon] = useState('main');
  const [model, setModel] = useState('sonnet');

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
      <Transcript messages={MESSAGES} />
      <Composer
        placement="ares:/scratch/j4471"
        asyncCount={2}
        contextPercent={41}
        modelId={model}
        onModelChange={setModel}
        onSubmit={() => {}}
        models={[
          { id: 'sonnet', label: 'claude-sonnet-5', detail: 'Anthropic' },
          { id: 'opus', label: 'claude-opus-5', detail: 'Anthropic' },
        ]}
      />
    </AppShell>
  );
}
