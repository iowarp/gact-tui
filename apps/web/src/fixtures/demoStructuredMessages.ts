/**
 * Demo/fixture data (demo Structured Messages) for offline rendering and visual tests; not used against a live backend.
 */
import type { Message } from '@clio/core';

export function structuredDemoMessages(): Message[] {
  return [
    {
      id: 'm-user-structured',
      role: 'user',
      parts: [
        {
          type: 'text',
          text: 'Find candidate stations, stage evidence, and produce an artifact.',
        },
      ],
    },
    {
      id: 'm-asst-structured',
      role: 'assistant',
      parts: [
        {
          type: 'tool_call',
          id: 'tc-filter',
          call_id: 'tc-filter',
          tool_name: 'mcp_filter_records',
          input: { region: 'Los Angeles', radius_km: 100, limit: 4 },
        },
        {
          type: 'tool_result',
          call_id: 'tc-filter',
          output: JSON.stringify({
            status: 'filtered',
            center: { lat: 34.0536909, lon: -118.242766 },
            radius_km: 100,
            input_count: 155,
            matched_count: 72,
            records: [
              { station: 'MTA1', distance_km: 0.3749 },
              { station: 'PKRD', distance_km: 2.3714 },
              { station: 'ELSC', distance_km: 4.0982 },
            ],
          }),
        },
        {
          type: 'tool_result',
          metadata: { tool_name: 'write_report_artifact' },
          output: JSON.stringify({
            status: 'ready',
            artifact_path: '/workspace/reports/ground_motion_summary.md',
            summary: 'Wrote a collaborator handoff report with retained evidence and caveats.',
            rows: 18,
          }),
        },
        {
          type: 'text',
          text: 'The evidence and report artifact are ready for review.',
        },
      ],
    },
  ];
}
