import type { A2UISurface, Artifact, Message, ToolInvocation } from '@clio/core/v3';
import { CLIO_WORKSPACE_CATALOG_ROW } from '@/test-fixtures/a2ui/v0_9_1/fixtures';
import type { ClioConversationProps } from '@/components/clio/conversation-types';
import { TOUR_PRACTICE_SESSION_ID as SESSION, TOUR_PRACTICE_WORKSPACE_ID } from './tour-transport';

/*
 * The scripted practice conversation. Every id resolves to bundled sample data
 * (`gallery-repository.ts`), so the real transcript, artifact card and A2UI
 * components render it exactly as they would a live session.
 */

const SURFACE_ID = 'tour_storm_tracks';
const PLOT_ARTIFACT = 'artifact_plot';
const TRACKS = 'artifact://artifact_gallery_hurricane_tracks';
const model = { provider_id: 'tour', model_id: 'practice' };
const started = Date.parse('2026-10-01T09:00:00Z');
const at = (seconds: number) => new Date(started + seconds * 1000).toISOString();

const PLOT_SCRIPT = [
  'import pandas as pd, matplotlib.pyplot as plt',
  "gnss = pd.read_csv('data/BKL1.csv', parse_dates=['time'])",
  "gnss.plot(x='days', y='up_mm', title='Vertical displacement, station BKL1')",
  "plt.savefig('figures/bkl1-vertical.png', dpi=150)",
].join('\n');

function user(id: string, text: string, seconds: number): Message {
  return {
    id,
    session_id: SESSION,
    role: 'user',
    created_at: at(seconds),
    model,
    blocks: [{ id: `${id}-text`, type: 'text', text }],
  };
}

function assistant(id: string, seconds: number, blocks: Message['blocks']): Message {
  return {
    id,
    run_id: `run_${id}`,
    turn_id: `turn_${id}`,
    session_id: SESSION,
    role: 'assistant',
    created_at: at(seconds),
    model,
    blocks,
  };
}

const plotTool: ToolInvocation = {
  id: 'tour_plot',
  session_id: SESSION,
  name: 'run_code',
  title: 'Run script',
  state: 'succeeded',
  input: { path: 'scripts/plot_bkl1.py', language: 'python', code: PLOT_SCRIPT },
  output: { exit_code: 0, stdout: 'Saved figures/bkl1-vertical.png' },
  started_at: at(3),
  completed_at: at(5),
  duration_ms: 2100,
  presentation: {
    action: 'Run script',
    subject: 'script',
    summary: 'exit 0',
    blocks: [
      {
        id: 'script',
        type: 'link',
        target: 'file',
        uri: 'scripts/plot_bkl1.py',
        label: 'plot_bkl1.py',
      },
      { id: 'code', type: 'code', language: 'python', text: PLOT_SCRIPT },
      {
        id: 'terminal',
        type: 'terminal',
        command: 'python scripts/plot_bkl1.py',
        text: 'Saved figures/bkl1-vertical.png\n',
        exit_code: 0,
      },
    ],
  },
};

const plot: Artifact = {
  id: PLOT_ARTIFACT,
  session_id: SESSION,
  workspace_id: TOUR_PRACTICE_WORKSPACE_ID,
  name: 'bkl1-vertical.png',
  media_type: 'image/png',
  uri: `artifact://${PLOT_ARTIFACT}`,
  created_at: at(5),
};

/** The plot, sized for the variant the practice repository serves in each theme. */
export function practicePlot(light: boolean): Artifact {
  return { ...plot, size: light ? 53700 : 50870 };
}

const surface: A2UISurface = {
  id: SURFACE_ID,
  session_id: SESSION,
  run_id: 'run_tracks',
  message_id: 'tracks',
  part_id: 'tour_tracks_part',
  catalog_id: CLIO_WORKSPACE_CATALOG_ROW.catalogId,
  protocol_version: '0.9.1',
  revision: 1,
  state: 'ready',
  message_revisions: [1, 1],
  messages: [
    {
      version: 'v0.9.1',
      createSurface: { surfaceId: SURFACE_ID, catalogId: CLIO_WORKSPACE_CATALOG_ROW.catalogId },
    },
    {
      version: 'v0.9.1',
      updateComponents: {
        surfaceId: SURFACE_ID,
        components: [
          { id: 'root', component: 'Column', children: ['map', 'table'] },
          {
            id: 'map',
            component: 'clio.map.v1',
            title: 'Atlantic hurricane tracks, 2017 and 2019',
            dataUri: TRACKS,
            latitudeField: 'lat',
            longitudeField: 'lon',
            labelField: 'label',
            idField: 'observation_id',
            trackField: 'storm',
            orderField: 'time',
            filterFields: ['storm', 'year', 'wind_kt'],
            selection: { path: '/selection/tracks' },
            selectionField: 'observation_id',
          },
          {
            id: 'table',
            component: 'clio.data-table.v1',
            dataUri: TRACKS,
            columns: ['storm', 'time', 'wind_kt', 'lat', 'lon'],
            selection: { path: '/selection/tracks' },
            selectionField: 'observation_id',
          },
        ],
      },
    },
  ],
} as A2UISurface;

const PLOT_REPLY: Message['blocks'] = [
  { id: 'plot-tool', type: 'tool', tool_id: plotTool.id },
  {
    id: 'plot-text',
    type: 'text',
    channel: 'answer',
    text: 'BKL1 rose about 4.7 mm over 90 days, with most of the uplift between days 45 and 70.',
  },
  { id: 'plot-artifact', type: 'artifact', artifact_id: PLOT_ARTIFACT },
];

const TRACKS_REPLY: Message['blocks'] = [
  {
    id: 'tracks-text',
    type: 'text',
    channel: 'answer',
    text: 'Harvey, Maria and Dorian, 212 observations. The map and table share one selection.',
  },
  { id: 'tracks-surface', type: 'a2ui', surface_id: SURFACE_ID },
];

export interface PracticeProgress {
  /** Exchanges started, 0 to 2. */
  turns: number;
  /** The newest exchange is still being answered. */
  working: boolean;
  /** What the learner sent for each exchange; empty uses the scripted request. */
  sent: readonly string[];
}

/**
 * The conversation after `progress.turns` scripted exchanges. While the newest
 * one is working, the first shows its script running and the second has no
 * answer yet.
 */
export function practiceConversation(
  progress: PracticeProgress,
  light = false,
): ClioConversationProps {
  const { turns, working, sent } = progress;
  const messages: Message[] = [];
  const tools: Record<string, ToolInvocation> = {};
  if (turns >= 1) {
    const presentation = plotTool.presentation!;
    const busy = working && turns === 1;
    messages.push(user('plot', sent[0] || 'Plot the vertical displacement at station BKL1.', 0));
    messages.push(assistant('plot_reply', 2, busy ? PLOT_REPLY.slice(0, 1) : PLOT_REPLY));
    const {
      output: _output,
      completed_at: _completed,
      duration_ms: _duration,
      ...running
    } = plotTool;
    tools[plotTool.id] = busy
      ? {
          ...running,
          // The sample timeline is dated; a running row counts up from now.
          started_at: new Date().toISOString(),
          state: 'running',
          presentation: {
            ...presentation,
            summary: '',
            blocks: presentation.blocks?.filter((block) => block.type !== 'terminal'),
          },
        }
      : plotTool;
  }
  if (turns >= 2) {
    messages.push(
      user('tracks', sent[1] || 'Show the 2017 and 2019 Atlantic hurricane tracks.', 30),
    );
    if (!working) messages.push(assistant('tracks_reply', 32, TRACKS_REPLY));
  }
  return {
    sessionId: SESSION,
    workspaceId: TOUR_PRACTICE_WORKSPACE_ID,
    messages,
    tools,
    tasks: {},
    subagents: {},
    artifacts: turns >= 1 && !(working && turns === 1) ? { [plot.id]: practicePlot(light) } : {},
    surfaces: turns >= 2 ? { [surface.id]: surface } : {},
  };
}
