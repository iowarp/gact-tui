import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHANNEL_WRITE_INTERVAL_MS,
  McpAppStateBridge,
  channelValueFromPath,
  type ChannelIssue,
  type McpAppChannel,
} from './mcp-app-state-bridge';

const TIME: McpAppChannel = { key: 'time', path: '/selection/time', tool: 'set_time' };
const LEVEL: McpAppChannel = { key: 'level', path: '/params/level', tool: 'set_level' };
const CAMERA: McpAppChannel = { key: 'camera', path: '/view/camera' };

function harness(channels: McpAppChannel[] = [TIME, LEVEL, CAMERA]) {
  const model = new Map<string, unknown>();
  const writes: Array<[string, unknown]> = [];
  const calls: Array<[string, Record<string, unknown>]> = [];
  const issues: Array<ChannelIssue | undefined> = [];
  let failNext: Error | undefined;
  const bridge = new McpAppStateBridge({
    channels,
    componentId: 'app',
    write: (path, value) => {
      writes.push([path, value]);
      model.set(path, value);
      // The data model notifies every subscriber, the bridge included.
      bridge.pathChanged(path, value);
    },
    callTool: async (channel, args) => {
      calls.push([channel.tool ?? '', args]);
      if (failNext) {
        const error = failNext;
        failNext = undefined;
        throw error;
      }
    },
    onIssue: (issue) => issues.push(issue),
  });
  return {
    bridge,
    writes,
    calls,
    issues,
    failOnce: (error: Error) => {
      failNext = error;
    },
  };
}

describe('McpAppStateBridge', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('writes a reported key to its path as a shared selection, without echoing it back', () => {
    const { bridge, writes, calls } = harness();
    bridge.report({ structuredContent: { time: 4, unrelated: 1 } });
    expect(writes).toEqual([]);
    vi.advanceTimersByTime(CHANNEL_WRITE_INTERVAL_MS);
    expect(writes).toEqual([['/selection/time', { field: 'time', values: [4], source: 'app' }]]);
    expect(calls).toEqual([]);
  });

  it('writes a plain path verbatim and reports without structured content do nothing', () => {
    const { bridge, writes } = harness();
    bridge.report({ content: [{ type: 'text', text: 'hello' }] });
    bridge.report({ structuredContent: { level: { lo: 1, hi: 2 } } });
    vi.advanceTimersByTime(CHANNEL_WRITE_INTERVAL_MS);
    expect(writes).toEqual([['/params/level', { lo: 1, hi: 2 }]]);
  });

  it('keeps at most ten writes for sixty reports in one second, and the last value wins', () => {
    const { bridge, writes } = harness();
    for (let index = 1; index <= 60; index += 1) {
      bridge.report({ structuredContent: { time: index } });
      vi.advanceTimersByTime(1000 / 60);
    }
    vi.advanceTimersByTime(CHANNEL_WRITE_INTERVAL_MS);
    expect(writes.length).toBeLessThanOrEqual(10);
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.at(-1)).toEqual([
      '/selection/time',
      { field: 'time', values: [60], source: 'app' },
    ]);
  });

  it('calls the channel tool once with the new value when another component changes the path', () => {
    const { bridge, calls } = harness();
    const fromChart = { field: 'time', values: [7], source: 'chart' };
    bridge.pathChanged('/selection/time', fromChart);
    bridge.pathChanged('/selection/time', fromChart);
    expect(calls).toEqual([['set_time', { time: 7 }]]);
  });

  it('does not write back the view report that follows its own tool call', () => {
    const { bridge, calls, writes } = harness();
    bridge.pathChanged('/selection/time', { field: 'time', values: [7], source: 'chart' });
    bridge.report({ structuredContent: { time: 7 } });
    vi.advanceTimersByTime(CHANNEL_WRITE_INTERVAL_MS);
    expect(writes).toEqual([]);
    // A later change in the view is written again.
    bridge.report({ structuredContent: { time: 8 } });
    vi.advanceTimersByTime(CHANNEL_WRITE_INTERVAL_MS);
    expect(writes).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it('skips a value the view already shows, a cleared selection and a report-only channel', () => {
    const { bridge, calls } = harness();
    bridge.report({ structuredContent: { time: 3 } });
    vi.advanceTimersByTime(CHANNEL_WRITE_INTERVAL_MS);
    bridge.pathChanged('/selection/time', { field: 'time', values: [3], source: 'table' });
    bridge.pathChanged('/selection/time', { field: 'time', values: [] });
    bridge.pathChanged('/view/camera', { azimuth: 10 });
    bridge.pathChanged('/elsewhere', 1);
    expect(calls).toEqual([]);
  });

  it('sends a plain path value verbatim and a multi-value selection as a list', () => {
    const { bridge, calls } = harness();
    bridge.pathChanged('/params/level', 0.5);
    bridge.pathChanged('/selection/time', { field: 'time', values: [1, 2] });
    expect(calls).toEqual([
      ['set_level', { level: 0.5 }],
      ['set_time', { time: [1, 2] }],
    ]);
  });

  it('reports a failed tool call and a value a selection cannot hold', async () => {
    const { bridge, issues, writes, failOnce } = harness();
    failOnce(new Error('tool refused'));
    bridge.pathChanged('/selection/time', { field: 'time', values: [9] });
    await vi.runAllTimersAsync();
    expect(issues).toContainEqual({ kind: 'tool_failed', key: 'time', message: 'tool refused' });
    bridge.report({ structuredContent: { time: { nested: true } } });
    vi.advanceTimersByTime(CHANNEL_WRITE_INTERVAL_MS);
    expect(writes).toEqual([]);
    expect(issues).toContainEqual({ kind: 'not_a_selection_value', key: 'time' });
  });

  it('stops after dispose', () => {
    const { bridge, writes, calls } = harness();
    bridge.report({ structuredContent: { time: 1 } });
    bridge.dispose();
    vi.advanceTimersByTime(CHANNEL_WRITE_INTERVAL_MS);
    bridge.pathChanged('/selection/time', { field: 'time', values: [2] });
    expect(writes).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('reads the channel value from a path', () => {
    expect(channelValueFromPath(TIME, { field: 'time', values: ['a'] })).toBe('a');
    expect(channelValueFromPath(TIME, 'not a selection')).toBeUndefined();
    expect(channelValueFromPath(LEVEL, 3)).toBe(3);
  });
});
