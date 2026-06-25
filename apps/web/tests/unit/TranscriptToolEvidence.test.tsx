import { render, screen, cleanup } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { Transcript } from '../../src/components/Transcript.js';

afterEach(cleanup);

describe('Transcript tool evidence', () => {
  it('renders a structured JSON tool result by CONTENT TYPE (generic preview + show raw)', () => {
    // A structured object that is not an image/diff/table surfaces as the `json`
    // content type: a generic collapsed preview plus a "show raw" affordance.
    // No backend key vocabulary, no tool-name-derived card title.
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

    // The result renders by detected content type, not a coupled "records result"
    // card. A generic key/value preview is shown and the raw body is reachable.
    expect(screen.getByText('status: filtered', { exact: false })).toBeTruthy();
    expect(screen.getByTestId('tool-raw-toggle')).toBeTruthy();
    // No backend-coupled card title is emitted.
    expect(screen.queryByText('records result')).toBeNull();
  });

  it('renders an artifact-like JSON tool result by content type, not a coupled card', () => {
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

    // Detected as the `json` content type: generic preview + show raw. The path
    // appears in the preview/raw, but there is no tool-name-derived "artifact
    // result" title.
    expect(screen.getByText('/tmp/clio-report/final_summary.md', { exact: false })).toBeTruthy();
    expect(screen.getByTestId('tool-raw-toggle')).toBeTruthy();
    expect(screen.queryByText('artifact result')).toBeNull();
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
