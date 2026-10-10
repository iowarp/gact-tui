import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { attentionProfileSchema, type AttentionLookup } from '@clio/core/v3';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AttentionLookupResults } from './attention-lookup-results';

afterEach(cleanup);

const profile = attentionProfileSchema.parse({});
const view = (id: string) => ({
  kind: 'generated' as const,
  available: true as const,
  lm_call_id: `call-${id}`,
  response_id: `response-${id}`,
  capture_sha256: `capture-${id}`,
  request_id: `chatcmpl-0123456789abcdef-${id}`,
  profile_revision: 'profile-1',
  profile,
  message_id: 'm',
  selection: { part_id: 'p', field: 'text', text: 'selected' },
  selected_steps: [1],
  residual: 0.2,
  sources: [
    { domain: 'tool_definitions', share: 0.5 },
    { domain: 'system', share: 0.2 },
    { domain: 'tool_result', share: 0.1 },
  ],
  flags: [],
  sections: [{ label: 'user' }, { label: 'spotter_query_tasks' }],
  blocks: [
    {
      message_id: 'm1',
      part_id: 'p1',
      field: 'text',
      kind: 'user',
      section: 0,
      share: 0.04,
      mean: 0,
      runs: [],
    },
    {
      message_id: 'm2',
      part_id: 'p2',
      field: 'output',
      kind: 'tool_result',
      section: 1,
      share: 0.1,
      mean: 0,
      runs: [],
    },
  ],
});

const result = {
  schema: 'clio.attention.lookup.v1',
  direction: 'generated_to_source',
  profile,
  profile_revision: 'profile-1',
  selection_count: 1,
  views: [view('a'), view('b')],
  unavailable: [],
  next_cursor: null,
} as unknown as AttentionLookup;

it('names each capture by its model call, lists every scored section and the tool behind a result', () => {
  render(
    <TooltipProvider>
      <AttentionLookupResults result={result} />
    </TooltipProvider>,
  );
  expect(screen.getByText('Model call 1 of 2')).toBeTruthy();
  expect(screen.getByText('Model call 2 of 2')).toBeTruthy();
  expect(screen.queryByText(/Capture 0123456789ab/)).toBeNull();
  const legend = (text: string) =>
    screen.getAllByText(
      (_, element) => element?.tagName === 'SPAN' && element.textContent?.trim() === text,
    );
  expect(legend('Tool definitions 50.0%').length).toBe(2);
  expect(legend('System prompt 20.0%').length).toBe(2);
  expect(legend('Tool results 10.0%').length).toBe(2);
  expect(legend('Spread thin 20.0%').length).toBe(2);
  expect(screen.getAllByText('Inspect tool result (spotter_query_tasks)').length).toBe(2);
  expect(screen.getAllByText('Inspect user').length).toBe(2);
});
