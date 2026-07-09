import { describe, expect, it } from 'vitest';
import type { Part } from '@clio/core';
import { buildAssistantTurnModel } from '../../src/components/transcriptDelegationModel.js';

// #732 / epic #880 (S2). The client no longer dedups `tool_call.thought` against a
// preceding text row — the server now guarantees single-representation
// (`next_thought` owns its visible text row; the tool_call carries the copy ONLY
// when there is no visible row) and the render must show the tool thought
// VERBATIM. This is the model-level driver the deleted `toolThoughtDedup.test.ts`
// used to own: it feeds a raw `tool_call` Part (with a `thought`) through
// `buildAssistantTurnModel` and asserts the ToolRow carries it through. (The
// existing `transcriptDelegationModel.test.ts` covers a text ROW, not a
// `tool_call` Part, so this case would otherwise be undriven.)

const text = (id: string, agent: string, t: string): Part =>
  ({ type: 'text', id, agent_id: agent, text: t }) as unknown as Part;
const toolCall = (id: string, agent: string, callId: string, name: string, thought: string): Part =>
  ({ type: 'tool_call', id, agent_id: agent, call_id: callId, tool_name: name, thought, input: {} }) as unknown as Part;

const NEXT =
  'The question provides a place name "Los Angeles" with no explicit coordinates, so I will call geo_geocode to resolve it against OSM Nominatim.';

const toolRow = (parts: Part[]) =>
  buildAssistantTurnModel(parts)!.rows.find((r) => r.kind === 'tool') as { thought: string };

describe('tool_call thought renders verbatim (server owns single-representation)', () => {
  it('keeps the tool thought even when a same-agent text row carries the SAME prose', () => {
    // Scenario-B-on-reload shape: the copy is on the tool call. The old client
    // dedup would have cleared this (matching the preceding text row); it must NOT
    // anymore — the server decides representation, the client renders what it gets.
    const parts = [
      text('t1', 'geospatial', NEXT),
      toolCall('c1', 'geospatial', 'call1', 'geo_geocode', NEXT),
    ];
    expect(toolRow(parts).thought).toBe(NEXT);
  });

  it('passes a distinct tool thought through unchanged', () => {
    const parts = [toolCall('c1', 'geospatial', 'call1', 'geo_geocode', NEXT)];
    expect(toolRow(parts).thought).toBe(NEXT);
  });

  it('renders an empty thought as empty (server cleared the redundant copy)', () => {
    const parts = [
      text('t1', 'geospatial', NEXT),
      toolCall('c1', 'geospatial', 'call1', 'geo_geocode', ''),
    ];
    expect(toolRow(parts).thought).toBe('');
  });
});
