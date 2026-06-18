import { render, screen, cleanup, within } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { Transcript } from '../../src/components/Transcript.js';
import type { Message } from '@clio/core';

afterEach(cleanup);

const messages: Message[] = [
  {
    id: 'm1',
    role: 'user',
    parts: [{ type: 'text', text: 'hello' }],
  },
  {
    id: 'm2',
    role: 'assistant',
    parts: [
      { type: 'thinking', text: 'pondering' },
      { type: 'tool_call', id: 'tc1', tool_name: 'ReadFile', input: { path: 'x' } },
      { type: 'text', text: 'done' },
    ],
  },
];

describe('Transcript', () => {
  it('renders a row per message', () => {
    render(() => <Transcript messages={messages} density="normal" />);
    expect(screen.getByTestId('msg-m1')).toBeTruthy();
    expect(screen.getByTestId('msg-m2')).toBeTruthy();
  });

  it('hides tool calls/results in summary mode (via CSS data-density)', () => {
    render(() => <Transcript messages={messages} density="summary" />);
    expect(screen.getByTestId('transcript').getAttribute('data-density')).toBe('summary');
  });

  it('renders verbose tool call body in verbose mode', () => {
    render(() => <Transcript messages={messages} density="verbose" />);
    expect(screen.getByTestId('toolcall-tc1')).toBeTruthy();
    expect(screen.getByText('Path')).toBeTruthy();
    expect(screen.getByText('x')).toBeTruthy();
  });

  it('renders structured JSON tool results as readable evidence rows', () => {
    render(() => (
      <Transcript
        density="normal"
        messages={[
          {
            id: 'm-structured-tool',
            role: 'assistant',
            parts: [
              {
                type: 'tool_call',
                id: 'tc-geo',
                call_id: 'tc-geo',
                tool_name: 'any_mcp_filter_points',
                input: { region: 'Los Angeles', radius_km: 100 },
              },
              {
                type: 'tool_result',
                call_id: 'tc-geo',
                output: JSON.stringify({
                  status: 'filtered',
                  center: { lat: 34.0536909, lon: -118.242766 },
                  radius_km: 100,
                  input_count: 155,
                  matched_count: 72,
                  points: [
                    { station: 'MTA1', distance_km: 0.3749 },
                    { station: 'PKRD', distance_km: 2.3714 },
                  ],
                }),
              },
            ],
          },
        ]}
      />
    ));

    const summary = within(screen.getByTestId('structured-tool-result-summary'));
    expect(screen.getByText('records result')).toBeTruthy();
    expect(summary.getByText('status')).toBeTruthy();
    expect(summary.getByText('filtered')).toBeTruthy();
    expect(summary.getByText('records')).toBeTruthy();
    expect(summary.getByText('MTA1 · distance: 0.3749')).toBeTruthy();
    expect(screen.getByText('Raw result')).toBeTruthy();
    expect(summary.queryByText(/"matched_count"/)).toBeNull();
  });

  it('renders artifact-like JSON tool results without inline raw JSON', () => {
    render(() => (
      <Transcript
        density="normal"
        messages={[
          {
            id: 'm-artifact-tool',
            role: 'assistant',
            parts: [
              {
                type: 'tool_result',
                metadata: { tool_name: 'write_report_artifact' },
                output: JSON.stringify({
                  status: 'ready',
                  artifact_path: '/tmp/clio-report/final_summary.md',
                  summary: 'Wrote collaborator handoff report with retained evidence and caveats.',
                  rows: 18,
                }),
              },
            ],
          },
        ]}
      />
    ));

    expect(screen.getByText('artifact result')).toBeTruthy();
    const summary = within(screen.getByTestId('structured-tool-result-summary'));
    expect(summary.getByText('artifact')).toBeTruthy();
    expect(summary.getByText('/tmp/clio-report/final_summary.md')).toBeTruthy();
    expect(summary.getByText(/Wrote collaborator handoff report/)).toBeTruthy();
    expect(summary.queryByText(/"artifact_path"/)).toBeNull();
  });

  it('summarizes CLIO typed workflow state instead of dumping JSON inline', () => {
    render(() => (
      <Transcript
        density="normal"
        messages={[
          {
            id: 'm-workflow',
            role: 'assistant',
            parts: [
              {
                type: 'text',
                text:
                  'Evidence is ready.\n\nCLIO typed workflow state:\n' +
                  JSON.stringify({
                    workflow_state: {
                      acquisition: {
                        status: 'staged',
                        local_path: '/tmp/run/MTA1.csv',
                        size_bytes: 50424246,
                      },
                      station_catalog: {
                        status: 'ranked',
                        candidate_count: 72,
                      },
                      artifact: {
                        status: 'ready',
                        path: '/tmp/run/MTA1_plot.png',
                      },
                    },
                  }),
              },
            ],
          },
        ]}
      />
    ));

    expect(screen.getByText('Evidence is ready.')).toBeTruthy();
    expect(screen.getByTestId('workflow-state-card')).toBeTruthy();
    expect(screen.getByText('Acquisition')).toBeTruthy();
    expect(screen.getByText('Station Catalog')).toBeTruthy();
    expect(screen.getByText('Artifact')).toBeTruthy();
    expect(screen.getByText('Raw state')).toBeTruthy();
  });

  it('summarizes workflow state carried by expert handoff parts', () => {
    render(() => (
      <Transcript
        density="normal"
        messages={[
          {
            id: 'm-handoff',
            role: 'assistant',
            parts: [
              {
                type: 'expert_handoff',
                metadata: {
                  parent_id: 'main',
                  agent_id: 'data',
                  status: 'failed',
                  output_summary:
                    "Child expert 'data' failed while delegated from 'main': _UnsupportedSessionAgent. data\n\n" +
                    'CLIO durable typed workflow state:\n' +
                    JSON.stringify({
                      workflow_state: {
                        delegation: {
                          status: 'failed',
                          failed_child: 'data',
                          parent: 'main',
                          error: '_UnsupportedSessionAgent',
                        },
                      },
                    }),
                },
              },
            ],
          },
        ]}
      />
    ));
    expect(screen.getByText('Delegation')).toBeTruthy();
    expect(screen.getAllByText('Workflow blocker').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/child expert: data/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/required tools are not available/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Raw state')).toBeTruthy();
  });

  it('keeps a turn-level workflow blocker visible after the final answer text', () => {
    render(() => (
      <Transcript
        density="normal"
        messages={[
          {
            id: 'm-turn-blocker',
            role: 'assistant',
            parts: [
              {
                type: 'expert_handoff',
                metadata: {
                  parent_id: 'main',
                  agent_id: 'data',
                  status: 'completed',
                  workflow_state: {
                    delegation: {
                      status: 'failed',
                      failed_child: 'ndp_dataset_discovery',
                      parent: 'data',
                      error: '_UnsupportedSessionAgent',
                    },
                  },
                },
              },
              {
                type: 'text',
                text:
                  '## Region\nSan Diego area resolved.\n\n' +
                  'The final answer is visible after a long workflow trace.',
              },
            ],
          },
        ]}
      />
    ));

    expect(screen.getByText('San Diego area resolved.')).toBeTruthy();
    expect(screen.getByTestId('turn-workflow-blocker')).toBeTruthy();
    expect(screen.getAllByText('Workflow blocker').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/child expert: ndp_dataset_discovery/)).toBeTruthy();
    expect(screen.getByText(/required tools are not available/)).toBeTruthy();
  });

  it('summarizes leading handoff evidence JSON before workflow state', () => {
    render(() => (
      <Transcript
        density="normal"
        messages={[
          {
            id: 'm-handoff-json',
            role: 'assistant',
            parts: [
              {
                type: 'expert_handoff',
                metadata: {
                  parent_id: 'main',
                  agent_id: 'geospatial',
                  status: 'completed',
                  output_summary:
                    JSON.stringify({
                      REGION_LABEL: 'San Diego area',
                      CENTER_LAT: 32.7157,
                      CENTER_LON: -117.1611,
                      RADIUS_KM: 50,
                      CONFIDENCE: 'high',
                      WARNINGS: ['Default radius of 50 km applied for area query.'],
                    }) +
                    '\n\nCLIO durable typed workflow state:\n' +
                    JSON.stringify({
                      workflow_state: {
                        geospatial: {
                          status: 'resolved',
                          region_name: 'San Diego area',
                        },
                      },
                    }),
                },
              },
            ],
          },
        ]}
      />
    ));

    expect(screen.getByText(/Resolved region: San Diego area/)).toBeTruthy();
    expect(screen.getByText(/center 32.7157, -117.1611/)).toBeTruthy();
    expect(screen.queryByText(/REGION_LABEL/)).toBeNull();
    expect(screen.getByTestId('workflow-state-card')).toBeTruthy();
  });

  it('renders fs_propose_edit metadata results as reviewable diff chips', () => {
    const diff =
      '--- a/handlers.go\n' +
      '+++ b/handlers.go\n' +
      '@@ -1,3 +1,3 @@\n' +
      '-fmt.Println("done", id)\n' +
      '+log.Printf("processed=%s", id)\n';
    let opened = '';

    render(() => (
      <Transcript
        density="normal"
        onOpenDiff={(d) => {
          opened = d.unified_diff ?? '';
        }}
        messages={[
          {
            id: 'm-tool-diff',
            role: 'assistant',
            parts: [
              {
                type: 'text',
                text: 'The proposed edit is ready for review.',
              },
            ],
            metadata: {
              tools_called: [
                {
                  name: 'fs_propose_edit',
                  args: { filepath: '/tmp/workspace/handlers.go' },
                  ok: true,
                  result: JSON.stringify({
                    path: '/tmp/workspace/handlers.go',
                    unified_diff: diff,
                    new_content: 'package main\n',
                  }),
                },
                {
                  name: 'fs_propose_edit',
                  args: { filepath: '/tmp/workspace/handlers.go' },
                  ok: true,
                  result: JSON.stringify({
                    path: '/tmp/workspace/handlers.go',
                    unified_diff: diff,
                    new_content: 'package main\n',
                  }),
                },
              ],
            },
          },
        ]}
      />
    ));

    expect(screen.getAllByTestId('filediff-chip')).toHaveLength(1);
    const chip = screen.getByTestId('filediff-chip');
    expect(chip.textContent).toContain('/tmp/workspace/handlers.go');
    chip.click();
    expect(opened).toContain('log.Printf');
  });

  it('renders backend command results as readable command cards', () => {
    render(() => (
      <Transcript
        density="normal"
        messages={[
          {
            id: 'm-command',
            role: 'assistant',
            metadata: {
              synthetic: 'command_result',
              command: '/cache-stats',
            },
            parts: [
              {
                type: 'text',
                metadata: {
                  synthetic: 'command_result',
                  command: '/cache-stats',
                },
                text: '[/cache-stats] ARC cache: hits=0 misses=0 hit_rate=0.00 capacity=1000',
              },
            ],
          },
        ]}
      />
    ));

    expect(screen.getByTestId('command-result-card')).toBeTruthy();
    expect(screen.getByText('Command result')).toBeTruthy();
    expect(screen.getByText('/cache-stats')).toBeTruthy();
    expect(screen.getByText(/ARC cache/)).toBeTruthy();
    expect(screen.queryByText(/\[\/cache-stats\]/)).toBeNull();
  });
});
