import type { McpAppOpenFromCallResult } from '@clio/core/v3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acquireSurfaceOpen, forgetSurfaceOpen, openedIdentity } from './mcp-app-surface-opens';

const opened: McpAppOpenFromCallResult = {
  ok: true,
  view: {
    appInstanceId: 'app_1',
    dataRef: 'ref_1',
    resourceUri: 'ui://clock/view',
    sourceServer: 'clock',
    toolName: 'clock_open',
    displayMode: 'inline',
  },
  savedCall: null,
  serverTools: ['set_time'],
};

describe('surface opens', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shares one open between mounts and closes after the last one goes', async () => {
    const open = vi.fn(async () => opened);
    const close = vi.fn();
    const first = acquireSurfaceOpen('k1', open, close);
    first.release();
    // An immediate remount (React's development double mount) keeps the view.
    const second = acquireSurfaceOpen('k1', open, close);
    await vi.runAllTimersAsync();
    expect(open).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
    await expect(second.outcome).resolves.toBe(opened);
    second.release();
    second.release();
    await vi.runAllTimersAsync();
    expect(close).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledWith(opened);
  });

  it('makes the call again after a failed open is forgotten', async () => {
    const failed: McpAppOpenFromCallResult = {
      ok: false,
      reason: 'tool_unavailable',
      detail: 'not connected',
      savedCall: null,
      serverTools: [],
    };
    const open = vi.fn(async () => failed);
    acquireSurfaceOpen('k2', open, vi.fn());
    forgetSurfaceOpen('k2');
    acquireSurfaceOpen('k2', open, vi.fn());
    expect(open).toHaveBeenCalledTimes(2);
    expect(openedIdentity('s', failed)).toBeUndefined();
    expect(openedIdentity('s', opened)).toEqual({
      sessionId: 's',
      appInstanceId: 'app_1',
      dataRef: 'ref_1',
    });
  });
});
