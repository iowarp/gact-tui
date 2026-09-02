import { describe, expect, it } from 'vitest';
import type { Message, Task, ToolInvocation } from '@clio/core/v3';
import { conversationTurnPresentation } from './conversation-turn-model';

const tools: Record<string, ToolInvocation> = {
  call_read: {
    id: 'call_read',
    session_id: 'session_1',
    name: 'fs_read_file',
    title: 'Read file',
    state: 'succeeded',
  },
  call_render: {
    id: 'call_render',
    session_id: 'session_1',
    name: 'create_a2ui_surface',
    title: 'Analysis view created',
    state: 'succeeded',
  },
};

const tasks: Record<string, Task> = {
  task_quality: {
    id: 'task_quality',
    session_id: 'session_1',
    title: 'Review station quality',
    state: 'completed',
    detail: 'Evidence retained with source identity.',
  },
};

describe('conversationTurnPresentation', () => {
  it('keeps a task returned after a tool inside the same causal activity iteration', () => {
    const message: Message = {
      id: 'assistant_task',
      session_id: 'session_1',
      role: 'assistant',
      created_at: '2026-08-24T00:00:00Z',
      blocks: [
        { id: 'thinking_task', type: 'reasoning', text: 'Review the station evidence.' },
        { id: 'tool_task', type: 'tool', tool_id: 'call_read' },
        { id: 'task_block', type: 'task', task_id: 'task_quality' },
        { id: 'artifact', type: 'artifact', artifact_id: 'artifact_1' },
      ],
    };

    const view = conversationTurnPresentation(message, tools, tasks);

    expect(view.iterations).toHaveLength(1);
    expect(view.iterations[0]?.tools.map((tool) => tool.id)).toEqual(['call_read']);
    expect(view.iterations[0]?.tasks.map((task) => task.id)).toEqual(['task_quality']);
    expect(view.residualBlocks.map((block) => block.id)).toEqual(['artifact']);
  });

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

    const view = conversationTurnPresentation(message, tools);

    expect(view.iterations).toHaveLength(2);
    expect(view.iterations[0]).toMatchObject({
      terminal: false,
      nextThoughts: ['I will inspect the evidence file.'],
      tools: [{ id: 'call_read' }],
    });
    expect(view.iterations[1]).toMatchObject({
      terminal: true,
      nextThoughts: ['I can now answer the question.'],
    });
    expect(view.residualBlocks.map((block) => block.id)).toEqual(['answer']);
  });

  it('preserves transcript order when any block lacks a canonical sequence', () => {
    const message: Message = {
      id: 'assistant_mixed_sequence',
      session_id: 'session_1',
      role: 'assistant',
      created_at: '2026-08-24T00:00:00Z',
      blocks: [
        {
          id: 'thinking_mixed',
          type: 'reasoning',
          text: 'Keep the provider transcript in arrival order.',
          sequence: 3,
        },
        {
          id: 'next_mixed',
          type: 'text',
          text: 'Continue from the observed reasoning.',
          channel: 'next_thought',
          sequence: 1,
        },
        {
          id: 'answer_mixed',
          type: 'text',
          text: 'Done.',
          channel: 'answer',
        },
      ],
    };

    const view = conversationTurnPresentation(message, tools);

    expect(view.iterations).toHaveLength(1);
    expect(view.iterations[0]?.thinking.map((part) => part.id)).toEqual(['thinking_mixed']);
    expect(view.iterations[0]?.nextThoughts).toEqual(['Continue from the observed reasoning.']);
  });

  it('uses only canonical transcript parts and retains UI and final-answer blocks', () => {
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
    const view = conversationTurnPresentation(message, tools);

    expect(view.iterations[0]?.thinking[0]?.text).toBe(
      '**Use the file reader.****Then inspect the result.**',
    );
    expect(view.iterations[0]?.thinking[0]?.label).toBe('Thinking');
    expect(view.iterations[0]?.tools.map((tool) => tool.id)).toEqual(['call_read']);
    expect(view.residualBlocks.map((block) => block.id)).toEqual(['surface', 'answer']);
  });

  it('keeps multiple tool calls from one model response in one iteration', () => {
    const repeatedThought = 'I will create the map and time-series surfaces now.';
    const message: Message = {
      id: 'assistant_multi_tool',
      session_id: 'session_1',
      role: 'assistant',
      created_at: '2026-08-24T00:00:00Z',
      blocks: [
        {
          id: 'thinking_multi',
          type: 'reasoning',
          text: 'Both views use the same grounded evidence.',
          provider_source: 'claude_code_sdk',
        },
        {
          id: 'next_multi',
          type: 'text',
          text: repeatedThought,
          channel: 'next_thought',
        },
        { id: 'tool_map', type: 'tool', tool_id: 'call_read' },
        { id: 'surface_map', type: 'a2ui', surface_id: 'surface_map' },
        {
          id: 'tool_plot',
          type: 'tool',
          tool_id: 'call_render',
          thought: repeatedThought,
        },
        { id: 'surface_plot', type: 'a2ui', surface_id: 'surface_plot' },
        {
          id: 'thinking_final',
          type: 'reasoning',
          text: 'Both surfaces are ready.',
          provider_source: 'claude_code_sdk',
        },
        {
          id: 'next_final',
          type: 'text',
          text: 'I can now answer with the observed limitation.',
          channel: 'next_thought',
        },
        { id: 'answer_multi', type: 'text', text: 'Complete.', channel: 'answer' },
      ],
    };

    const view = conversationTurnPresentation(message, tools);

    expect(view.iterations).toHaveLength(2);
    expect(view.iterations[0]?.thinking.map((part) => part.text)).toEqual([
      'Both views use the same grounded evidence.',
    ]);
    expect(view.iterations[0]?.nextThoughts).toEqual([repeatedThought]);
    expect(view.iterations[0]?.tools.map((tool) => tool.id)).toEqual(['call_read', 'call_render']);
    expect(view.iterations[1]?.thinking.map((part) => part.text)).toEqual([
      'Both surfaces are ready.',
    ]);
    expect(view.residualBlocks.map((block) => block.id)).toEqual([
      'surface_map',
      'surface_plot',
      'answer_multi',
    ]);
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
    const view = conversationTurnPresentation(message, tools);

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

    const view = conversationTurnPresentation(message, tools);

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

  it('derives the chain summary from the canonical visible thought', () => {
    const message: Message = {
      id: 'assistant_summary',
      session_id: 'session_1',
      run_id: 'turn_summary',
      role: 'assistant',
      created_at: '2026-08-24T00:00:00Z',
      blocks: [
        {
          id: 'thinking_summary',
          type: 'reasoning',
          text: 'Compare the grounded observations before acting.',
        },
        {
          id: 'next_summary',
          type: 'text',
          text: 'Compare the three grounded observations. Then present the ranking.',
          channel: 'next_thought',
        },
      ],
    };

    const view = conversationTurnPresentation(message, tools);

    expect(view.iterations[0]?.summary).toBe('Compare the three grounded observations.');
    expect(view.iterations[0]?.thinking[0]?.label).toBe('Thinking');
  });

  it('keeps a tool block whose invocation has not arrived in the residual lane', () => {
    const message: Message = {
      id: 'assistant_unresolved_tool',
      session_id: 'session_1',
      role: 'assistant',
      created_at: '2026-08-24T00:00:00Z',
      blocks: [
        { id: 'thinking_unresolved', type: 'reasoning', text: 'Read the evidence file.' },
        { id: 'tool_unresolved', type: 'tool', tool_id: 'call_not_yet_streamed' },
        { id: 'answer_unresolved', type: 'text', text: 'Done.', channel: 'answer' },
      ],
    };

    const view = conversationTurnPresentation(message, tools);

    expect(view.iterations[0]?.tools).toEqual([]);
    expect(view.residualBlocks.map((block) => block.id)).toEqual([
      'tool_unresolved',
      'answer_unresolved',
    ]);
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

    const view = conversationTurnPresentation(message, tools);

    expect(view.iterations[0]).toMatchObject({
      terminal: false,
      interrupted: true,
      summary: 'Resolve the region first.',
    });
  });

  it('keeps the server-provided response recovery text as the chain label', () => {
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

    const view = conversationTurnPresentation(message, tools);

    expect(view.iterations[0]?.summary).toBe(
      'The submit call failed because workflow_state is a required field I omitted.',
    );
    expect(view.iterations[0]?.nextThoughts).toEqual([
      'The submit call failed because workflow_state is a required field I omitted.',
    ]);
  });
});
