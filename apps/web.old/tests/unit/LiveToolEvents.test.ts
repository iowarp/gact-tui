import { describe, expect, it } from 'vitest';
import { applyLiveToolEvent } from '../../src/LiveToolEvents.js';
import type { ExecutionTranscriptEvent, RunningTool } from '../../src/live.js';

function makeHooks() {
  let runningTools: RunningTool[] = [];
  let executionEvents: ExecutionTranscriptEvent[] = [];
  const apply = <T,>(cur: T, next: T | ((prev: T) => T)): T =>
    typeof next === 'function' ? (next as (prev: T) => T)(cur) : next;
  return {
    hooks: {
      setRunningTools: (next: RunningTool[] | ((prev: RunningTool[]) => RunningTool[])) => {
        runningTools = apply(runningTools, next);
      },
      setExecutionEvents: (
        next: ExecutionTranscriptEvent[] | ((prev: ExecutionTranscriptEvent[]) => ExecutionTranscriptEvent[]),
      ) => {
        executionEvents = apply(executionEvents, next);
      },
    },
    get runningTools() {
      return runningTools;
    },
    get executionEvents() {
      return executionEvents;
    },
  };
}

describe('LiveToolEvents', () => {
  it('starts tools and appends a transcript event', () => {
    const h = makeHooks();

    expect(
      applyLiveToolEvent(
        'tool.call.started',
        { turn_id: 'u1', call_id: 'call_1', tool_name: 'shell' },
        h.hooks,
      ),
    ).toBe(true);

    expect(h.runningTools).toEqual([{ callId: 'call_1', toolName: 'shell', startedAt: expect.any(Number) }]);
    expect(h.executionEvents.map((event) => event.type)).toEqual(['tool.call.started']);
  });

  it('updates progress without emitting transcript events', () => {
    const h = makeHooks();
    applyLiveToolEvent('tool.call.started', { call_id: 'call_1', tool_name: 'shell' }, h.hooks);

    applyLiveToolEvent(
      'tool.call.progress',
      { call_id: 'call_1', progress: 1, total: 4, message: 'working' },
      h.hooks,
    );

    expect(h.runningTools[0]).toMatchObject({ progress: 0.25, progressMessage: 'working' });
    expect(h.executionEvents.map((event) => event.type)).toEqual(['tool.call.started']);
  });

  it('completes tools and appends a transcript event', () => {
    const h = makeHooks();
    applyLiveToolEvent('tool.call.started', { call_id: 'call_1', tool_name: 'shell' }, h.hooks);

    applyLiveToolEvent('tool.call.completed', { turn_id: 'u1', call_id: 'call_1' }, h.hooks);

    expect(h.runningTools).toEqual([]);
    expect(h.executionEvents.map((event) => event.type)).toEqual([
      'tool.call.started',
      'tool.call.completed',
    ]);
  });

  it('returns false for non-tool events', () => {
    expect(applyLiveToolEvent('message.completed', {}, makeHooks().hooks)).toBe(false);
  });
});
