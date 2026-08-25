import { describe, expect, it } from 'vitest';
import type { AgentIteration, Artifact, Message, ToolInvocation } from '@clio/core/v3';
import { conversationTurnPresentation, deduplicateArtifactBlocks } from './conversation-turn-model';

const tools: Record<string, ToolInvocation> = {
  call_read: {
    id: 'call_read',
    session_id: 'session_1',
    name: 'fs_read_file',
    title: 'Read file',
    state: 'succeeded',
  },
};

describe('conversationTurnPresentation', () => {
  it('groups provider thinking, next thought, and a tool into ordered iterations', () => {
    const message: Message = {
      id: 'assistant_1',
      session_id: 'session_1',
      role: 'assistant',
      created_at: '2026-08-24T00:00:00Z',
      blocks: [
        { id: 'thinking_1', type: 'reasoning', text: 'Inspect the requested file.' },
        {
          id: 'next_1',
          type: 'text',
          text: 'I will inspect the evidence file.',
          channel: 'next_thought',
        },
        { id: 'tool_1', type: 'tool', tool_id: 'call_read' },
        { id: 'thinking_2', type: 'reasoning', text: 'The evidence is sufficient.' },
        {
          id: 'next_2',
          type: 'text',
          text: 'I can now answer the question.',
          channel: 'next_thought',
        },
        { id: 'answer', type: 'text', text: 'The answer is 42.', channel: 'answer' },
      ],
    };

    const view = conversationTurnPresentation(message, [], tools);

    expect(view.authoritative).toBe(false);
    expect(view.iterations).toHaveLength(2);
    expect(view.iterations[0]).toMatchObject({
      terminal: false,
      nextThoughts: ['I will inspect the evidence file.'],
      tool: { id: 'call_read' },
    });
    expect(view.iterations[1]).toMatchObject({
      terminal: true,
      nextThoughts: ['I can now answer the question.'],
    });
    expect(view.residualBlocks.map((block) => block.id)).toEqual(['answer']);
  });

  it('prefers exact semantic iterations and retains UI and final-answer blocks', () => {
    const message: Message = {
      id: 'assistant_2',
      session_id: 'session_1',
      run_id: 'turn_1',
      role: 'assistant',
      created_at: '2026-08-24T00:00:00Z',
      blocks: [
        {
          id: 'provider_reasoning',
          type: 'reasoning',
          text: '**Use the file reader.****Then inspect the result.**',
          provider_source: 'codex_app_server',
        },
        { id: 'next_1', type: 'text', text: 'Inspecting evidence.', channel: 'next_thought' },
        { id: 'tool_1', type: 'tool', tool_id: 'call_read' },
        { id: 'surface', type: 'a2ui', surface_id: 'surface_1' },
        { id: 'answer', type: 'text', text: 'Evidence ready.', channel: 'answer' },
      ],
    };
    const iterations: AgentIteration[] = [
      {
        id: 'step_1',
        session_id: 'session_1',
        turn_id: 'turn_1',
        agent_id: 'main',
        step_index: 0,
        next_thought: 'Inspecting evidence.',
        terminal: false,
        tool: {
          id: 'step_1:tool',
          name: 'fs_read_file',
          state: 'succeeded',
          output: 'ready',
        },
      },
    ];

    const view = conversationTurnPresentation(message, iterations, tools);

    expect(view.authoritative).toBe(true);
    expect(view.iterations[0]?.thinking[0]?.text).toBe(
      '**Use the file reader.**\n\n**Then inspect the result.**',
    );
    expect(view.iterations[0]?.thinking[0]?.label).toBe('Thinking');
    expect(view.iterations[0]?.tool?.id).toBe('call_read');
    expect(view.residualBlocks.map((block) => block.id)).toEqual(['surface', 'answer']);
  });

  it('joins provider thinking across a child-agent transcript boundary', () => {
    const message: Message = {
      id: 'assistant_child',
      session_id: 'session_1',
      run_id: 'turn_child',
      role: 'assistant',
      created_at: '2026-08-24T00:00:00Z',
      blocks: [
        {
          id: 'thinking_spawn',
          type: 'reasoning',
          text: 'Resolve the place before searching stations.',
          source: 'provider',
        },
        {
          id: 'next_spawn',
          type: 'text',
          text: 'I will start the geospatial specialist.',
          channel: 'next_thought',
        },
        { id: 'child', type: 'subagent', subagent_id: 'task_geo' },
        {
          id: 'thinking_wait',
          type: 'reasoning',
          text: 'Wait for the grounded result.',
          source: 'provider',
        },
        {
          id: 'next_wait',
          type: 'text',
          text: 'The geospatial specialist is still working.',
          channel: 'next_thought',
        },
        { id: 'wait', type: 'tool', tool_id: 'call_read' },
      ],
    };
    const iterations: AgentIteration[] = [
      {
        id: 'step_spawn',
        session_id: 'session_1',
        turn_id: 'turn_child',
        agent_id: 'main',
        step_index: 0,
        next_thought: 'I will start the geospatial specialist.',
        terminal: false,
        tool: { id: 'spawn', name: 'spawn_agent_task', state: 'succeeded' },
      },
      {
        id: 'step_wait',
        session_id: 'session_1',
        turn_id: 'turn_child',
        agent_id: 'main',
        step_index: 1,
        next_thought: 'The geospatial specialist is still working.',
        terminal: false,
        tool: { id: 'wait', name: 'fs_read_file', state: 'succeeded' },
      },
    ];

    const view = conversationTurnPresentation(message, iterations, tools);

    expect(view.iterations[0]?.thinking[0]?.text).toBe(
      'Resolve the place before searching stations.',
    );
    expect(view.iterations[1]?.thinking[0]?.text).toBe('Wait for the grounded result.');
    expect(view.residualBlocks.map((block) => block.id)).toEqual(['child']);
  });

  it('does not invent a completed iteration from partial live provider blocks', () => {
    const message: Message = {
      id: 'assistant_live',
      session_id: 'session_1',
      role: 'assistant',
      created_at: '2026-08-24T00:00:00Z',
      blocks: [
        {
          id: 'reasoning_live',
          type: 'reasoning',
          text: '**Planning the tool call**',
          provider_source: 'codex_app_server',
        },
        {
          id: 'next_live',
          type: 'text',
          text: 'Resolve the region first.',
          channel: 'next_thought',
          streaming: true,
        },
      ],
    };

    const view = conversationTurnPresentation(message, [], tools);

    expect(view.iterations).toHaveLength(1);
    expect(view.iterations[0]).toMatchObject({
      terminal: false,
      interrupted: false,
      streaming: true,
      summary: 'Resolve the region first.',
    });
    expect(view.iterations[0]?.thinking[0]).toMatchObject({
      label: 'Thinking',
      streaming: false,
    });
  });

  it('uses CLIOs explicit iteration summary instead of truncating the agent response', () => {
    const message: Message = {
      id: 'assistant_summary',
      session_id: 'session_1',
      run_id: 'turn_summary',
      role: 'assistant',
      created_at: '2026-08-24T00:00:00Z',
      blocks: [],
    };
    const iterations: AgentIteration[] = [
      {
        id: 'step_summary',
        session_id: 'session_1',
        turn_id: 'turn_summary',
        agent_id: 'main',
        step_index: 0,
        thinking: 'Compare the grounded observations before acting.',
        next_thought:
          'The first sentence is a detailed narration that should remain available only inside the expanded step.',
        summary: 'Comparing grounded observations',
        terminal: false,
      },
    ];

    const view = conversationTurnPresentation(message, iterations, tools);

    expect(view.iterations[0]?.summary).toBe('Comparing grounded observations');
    expect(view.iterations[0]?.thinking[0]?.label).toBe('Thinking');
  });

  it('marks a cancelled partial response as interrupted instead of final', () => {
    const message: Message = {
      id: 'assistant_cancelled',
      session_id: 'session_1',
      run_id: 'turn_cancelled',
      role: 'assistant',
      created_at: '2026-08-24T00:00:00Z',
      completed_at: '2026-08-24T00:01:00Z',
      stop_reason: 'cancelled',
      blocks: [
        {
          id: 'partial_thought',
          type: 'text',
          text: 'Resolve the region first.',
          channel: 'next_thought',
        },
      ],
    };

    const view = conversationTurnPresentation(message, [], tools);

    expect(view.iterations[0]).toMatchObject({
      terminal: false,
      interrupted: true,
      summary: 'Resolve the region first.',
    });
  });

  it('keeps response-schema recovery expandable without using it as the chain label', () => {
    const message: Message = {
      id: 'assistant_retry',
      session_id: 'session_1',
      role: 'assistant',
      created_at: '2026-08-24T00:00:00Z',
      blocks: [
        {
          id: 'retry_thought',
          type: 'text',
          text: 'The submit call failed because workflow_state is a required field I omitted.',
          channel: 'next_thought',
        },
      ],
    };

    const view = conversationTurnPresentation(message, [], tools);

    expect(view.iterations[0]?.summary).toBe('Finalizing the response');
    expect(view.iterations[0]?.nextThoughts).toEqual([
      'The submit call failed because workflow_state is a required field I omitted.',
    ]);
  });

  it('preserves causally distinct same-named artifacts and removes only an exact duplicate', () => {
    const artifacts: Record<string, Artifact> = {
      artifact_v2: {
        id: 'artifact_v2',
        session_id: 'session_1',
        workspace_id: 'workspace_1',
        name: 'stations.csv',
        media_type: 'text/csv',
        uri: 'artifact://workspace_1/stations.csv@v2',
      },
      artifact_v3: {
        id: 'artifact_v3',
        session_id: 'session_1',
        workspace_id: 'workspace_1',
        name: 'stations.csv',
        media_type: 'text/csv',
        uri: 'artifact://workspace_1/stations.csv@v3',
      },
    };

    expect(
      deduplicateArtifactBlocks(
        [
          { id: 'answer', type: 'text', text: 'Complete.', channel: 'answer' },
          { id: 'link_v2', type: 'artifact', artifact_id: 'artifact_v2' },
          { id: 'link_v3', type: 'artifact', artifact_id: 'artifact_v3' },
          { id: 'link_v3_duplicate', type: 'artifact', artifact_id: 'artifact_v3' },
        ],
        artifacts,
      ).map((block) => block.id),
    ).toEqual(['answer', 'link_v2', 'link_v3_duplicate']);
  });
});
