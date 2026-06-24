import { render, screen, cleanup, within } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { Transcript } from '../../src/components/Transcript.js';

afterEach(cleanup);

describe('Transcript tool evidence', () => {
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
