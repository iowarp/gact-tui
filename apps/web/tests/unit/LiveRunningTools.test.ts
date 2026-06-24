import { describe, expect, it } from 'vitest';
import {
  applyRunningToolCompleted,
  applyRunningToolProgress,
  applyRunningToolStarted,
  type RunningTool,
} from '../../src/LiveRunningTools.js';

describe('LiveRunningTools', () => {
  it('adds started tools and ignores duplicate call ids', () => {
    const first = applyRunningToolStarted([], { call_id: 'call_1', tool_name: 'shell' }, () => 10);
    expect(first).toEqual([{ callId: 'call_1', toolName: 'shell', startedAt: 10 }]);

    expect(
      applyRunningToolStarted(first, { call_id: 'call_1', tool_name: 'shell' }, () => 20),
    ).toBe(first);
  });

  it('falls back to tool_call_id and clamps progress by total', () => {
    const tools: RunningTool[] = [{ callId: 'tc_1', toolName: 'download', startedAt: 1 }];

    expect(
      applyRunningToolProgress(tools, {
        tool_call_id: 'tc_1',
        progress: 75,
        total: 50,
        message: 'staging',
      }),
    ).toEqual([
      {
        callId: 'tc_1',
        toolName: 'download',
        startedAt: 1,
        progress: 1,
        progressMessage: 'staging',
      },
    ]);
  });

  it('accepts fractional progress without a total', () => {
    const tools: RunningTool[] = [{ callId: 'call_1', toolName: 'plot', startedAt: 1 }];

    expect(applyRunningToolProgress(tools, { call_id: 'call_1', progress: 0.25 })).toEqual([
      { callId: 'call_1', toolName: 'plot', startedAt: 1, progress: 0.25 },
    ]);
  });

  it('removes completed tools and leaves unknown completions unchanged', () => {
    const tools: RunningTool[] = [
      { callId: 'call_1', toolName: 'plot', startedAt: 1 },
      { callId: 'call_2', toolName: 'shell', startedAt: 2 },
    ];

    expect(applyRunningToolCompleted(tools, { call_id: 'call_1' })).toEqual([
      { callId: 'call_2', toolName: 'shell', startedAt: 2 },
    ]);
    expect(applyRunningToolCompleted(tools, {})).toBe(tools);
  });
});
