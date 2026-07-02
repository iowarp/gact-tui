import { describe, expect, it } from 'vitest';
import type { Part } from '@clio/core';
import { buildAssistantTurnModel } from '../../src/components/transcriptDelegationModel.js';

// Regression: a ReAct tool_call carries the step's next_thought on `thought`, but
// that SAME next_thought also streams as a visible text row — so rendering both
// showed the answer twice. clio's stream-audit confirms the LLM emits it ONCE;
// the backend tool_observer injects the second copy onto tool_call.thought. The
// builder must drop that copy. Verified against three real EarthScope sessions.

const handoff = (id: string, parent: string, child: string, stage: string, question = ''): Part =>
  ({
    type: 'expert_handoff',
    id,
    agent_id: parent,
    parent_agent: parent,
    child_agent: child,
    stage,
    status: 'completed',
    metadata: question ? { question } : {},
  }) as unknown as Part;
const text = (id: string, agent: string, t: string): Part =>
  ({ type: 'text', id, agent_id: agent, text: t }) as unknown as Part;
const toolCall = (id: string, agent: string, callId: string, name: string, thought: string): Part =>
  ({ type: 'tool_call', id, agent_id: agent, call_id: callId, tool_name: name, thought, input: {} }) as unknown as Part;

const NEXT =
  'The question provides a place name "Los Angeles" with no explicit coordinates, so I will call geo_geocode to resolve it against OSM Nominatim.';
const toolRow = (parts: Part[]) =>
  buildAssistantTurnModel(parts)!.rows.find((r) => r.kind === 'tool') as { thought: string };

describe('tool_call thought is not rendered twice', () => {
  it('drops the tool thought when it repeats the preceding next_thought text row', () => {
    const parts = [
      handoff('h1', 'main', 'geospatial', 'delegate.started', 'Resolve LA'),
      text('t1', 'geospatial', NEXT),
      toolCall('c1', 'geospatial', 'call1', 'geo_geocode', NEXT),
    ];
    expect(toolRow(parts).thought).toBe('');
    // the reasoning still shows once — as the text row
    const model = buildAssistantTurnModel(parts)!;
    expect((model.rows.find((r) => r.kind === 'text') as { text: string }).text).toContain('Los Angeles');
  });

  it('drops it even when the tool thought is a marker-padded SUPERSET (corruption-fixed shape)', () => {
    const raw = `${NEXT}\n\`\`\`[[ ## next_thought ## ]]\n${NEXT}`;
    expect(
      toolRow([
        handoff('h1', 'main', 'geospatial', 'delegate.started', 'Resolve LA'),
        text('t1', 'geospatial', NEXT),
        toolCall('c1', 'geospatial', 'call1', 'geo_geocode', raw),
      ]).thought,
    ).toBe('');
  });

  it('keeps a genuinely distinct tool thought', () => {
    expect(
      toolRow([
        handoff('h1', 'main', 'geospatial', 'delegate.started', 'Resolve LA'),
        text('t1', 'geospatial', NEXT),
        toolCall('c1', 'geospatial', 'call1', 'geo_geocode', 'Defaulting the search radius to 150 km for this metropolitan region.'),
      ]).thought,
    ).toContain('150 km');
  });
});
