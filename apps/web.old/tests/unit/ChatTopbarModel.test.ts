import { describe, expect, it } from 'vitest';
import { runningToolsChipSummary } from '../../src/routes/ChatTopbarModel.js';
import type { RunningTool } from '../../src/live.js';

function tool(overrides: Partial<RunningTool>): RunningTool {
  return {
    callId: overrides.callId ?? 'call_1',
    toolName: overrides.toolName ?? 'shell',
    startedAt: overrides.startedAt ?? 1,
    ...overrides,
  };
}

describe('ChatTopbarModel', () => {
  it('returns no running-tool summary when no tools are running', () => {
    expect(runningToolsChipSummary([])).toBeNull();
  });

  it('summarizes visible tool names, progress, overflow, and hover title', () => {
    expect(
      runningToolsChipSummary([
        tool({ toolName: 'download', progress: 0.425, progressMessage: 'staging' }),
        tool({ callId: 'call_2', toolName: 'plot' }),
        tool({ callId: 'call_3', toolName: 'shell', progressMessage: 'running python' }),
      ]),
    ).toEqual({
      title: 'download — staging\nplot\nshell — running python',
      visibleNames: 'download, plot',
      progressPercent: 43,
      overflowCount: 1,
    });
  });

  it('omits progress and overflow when only one tool is running without progress', () => {
    expect(runningToolsChipSummary([tool({ toolName: 'geocode' })])).toEqual({
      title: 'geocode',
      visibleNames: 'geocode',
      progressPercent: null,
      overflowCount: 0,
    });
  });
});
