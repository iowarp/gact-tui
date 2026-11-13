/**
 * The state bridge between an MCP App's view and its A2UI surface (`clio.mcp-app.v1`).
 *
 * View to surface: each key the view reports in `ui/update-model-context`
 * `structuredContent` that a channel names is written to the channel's data-model
 * path. Reports for one channel that arrive faster than ten a second are dropped
 * and the last one is kept: a channel writes at most once per 100 ms, at the end
 * of the window, with the latest value.
 *
 * Surface to view: when a bound path changes from outside the view, the channel's
 * tool is called once with `{[key]: value}`. A change the bridge wrote itself, a
 * value the view already shows and a repeat of the value just sent are not sent.
 *
 * A channel bound to `/selection/<key>` holds the surface's shared selection
 * (`SelectionState`): the view's value is written as its one value (or its list
 * of values), with this component as the source, and read back the same way, so
 * charts, tables and maps bound to that path link with the view.
 */
import { parseSelectionState, type SelectionValue } from './selection-state';

export interface McpAppChannel {
  key: string;
  path: string;
  tool?: string;
}

/** At most one data-model write per channel in this many milliseconds (MA22). */
export const CHANNEL_WRITE_INTERVAL_MS = 100;

const SELECTION_PATH = /^\/selection\/[^/]+$/u;

export type ChannelIssue =
  | { kind: 'not_a_selection_value'; key: string }
  | { kind: 'tool_failed'; key: string; message: string };

export interface ChannelCounters {
  /** Values the view reported for this channel. */
  reports: number;
  /** Values written to the data model. */
  writes: number;
  /** Tool calls made because the path changed elsewhere. */
  toolCalls: number;
  /** The value last written, as JSON. */
  lastWritten?: string;
}

export interface McpAppStateBridgeOptions {
  channels: readonly McpAppChannel[];
  /** The `clio.mcp-app.v1` component id, the `source` of selections it writes. */
  componentId: string;
  write: (path: string, value: unknown) => void;
  /** Call the channel's tool with `{[key]: value}`; rejects with the reason it failed. */
  callTool: (channel: McpAppChannel, args: Record<string, unknown>) => Promise<void>;
  onIssue?: (issue: ChannelIssue | undefined, key: string) => void;
  onCounters?: (key: string, counters: ChannelCounters) => void;
}

interface ChannelState {
  channel: McpAppChannel;
  counters: ChannelCounters;
  pending?: { value: unknown };
  timer?: ReturnType<typeof setTimeout>;
  /** JSON of the data-model value this bridge last wrote at the path. */
  written?: string;
  /** JSON of the channel value the view last reported. */
  viewValue?: string;
  /** JSON of the channel value last sent to the tool. */
  sent?: string;
}

function json(value: unknown): string {
  return JSON.stringify(value) ?? 'undefined';
}

function isSelectionPath(path: string): boolean {
  return SELECTION_PATH.test(path);
}

function isSelectionValue(value: unknown): value is SelectionValue {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
}

/** The channel's value from what its path holds, or `undefined` when there is none. */
export function channelValueFromPath(channel: McpAppChannel, value: unknown): unknown {
  if (!isSelectionPath(channel.path)) return value;
  const state = parseSelectionState(value);
  if (!state || state.values.length === 0) return undefined;
  return state.values.length === 1 ? state.values[0] : state.values;
}

export class McpAppStateBridge {
  private readonly states: Map<string, ChannelState>;
  private disposed = false;

  constructor(private readonly options: McpAppStateBridgeOptions) {
    this.states = new Map(
      options.channels.map((channel) => [
        channel.key,
        {
          channel,
          counters: { reports: 0, writes: 0, toolCalls: 0 },
        },
      ]),
    );
  }

  /** The view reported its context (the `ui/update-model-context` params). */
  report(params: Record<string, unknown>): void {
    if (this.disposed) return;
    const structured = params.structuredContent;
    if (!structured || typeof structured !== 'object' || Array.isArray(structured)) return;
    for (const [key, value] of Object.entries(structured as Record<string, unknown>)) {
      const state = this.states.get(key);
      if (!state) continue;
      state.counters.reports += 1;
      state.pending = { value };
      this.emitCounters(state);
      if (!state.timer) {
        state.timer = setTimeout(() => this.flush(state), CHANNEL_WRITE_INTERVAL_MS);
      }
    }
  }

  /** A bound path holds `value`, possibly written by another component. */
  pathChanged(path: string, value: unknown): void {
    if (this.disposed) return;
    for (const state of this.states.values()) {
      if (state.channel.path !== path) continue;
      const encoded = json(value);
      if (encoded === state.written) continue; // the bridge's own write
      if (
        isSelectionPath(path) &&
        parseSelectionState(value)?.source === this.options.componentId
      ) {
        continue;
      }
      const channelValue = channelValueFromPath(state.channel, value);
      if (channelValue === undefined || !state.channel.tool) continue;
      const sent = json(channelValue);
      if (sent === state.viewValue || sent === state.sent) continue;
      state.sent = sent;
      state.counters.toolCalls += 1;
      this.emitCounters(state);
      const key = state.channel.key;
      void this.options.callTool(state.channel, { [key]: channelValue }).then(
        () => this.options.onIssue?.(undefined, key),
        (thrown: unknown) =>
          this.options.onIssue?.(
            {
              kind: 'tool_failed',
              key,
              message: thrown instanceof Error ? thrown.message : String(thrown),
            },
            key,
          ),
      );
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const state of this.states.values()) {
      if (state.timer) clearTimeout(state.timer);
      state.timer = undefined;
      state.pending = undefined;
    }
  }

  private flush(state: ChannelState): void {
    state.timer = undefined;
    const pending = state.pending;
    state.pending = undefined;
    if (!pending || this.disposed) return;
    const { channel } = state;
    const value = pending.value;
    const viewValue = json(value);
    state.viewValue = viewValue;
    if (viewValue === state.sent) return; // the view now shows the value just sent to it
    let modelValue: unknown = value;
    if (isSelectionPath(channel.path)) {
      const values = Array.isArray(value) ? value : [value];
      if (!values.every(isSelectionValue)) {
        this.options.onIssue?.({ kind: 'not_a_selection_value', key: channel.key }, channel.key);
        return;
      }
      modelValue = { field: channel.key, values, source: this.options.componentId };
    }
    state.written = json(modelValue);
    state.sent = undefined;
    state.counters.writes += 1;
    state.counters.lastWritten = state.written;
    this.emitCounters(state);
    this.options.write(channel.path, modelValue);
  }

  private emitCounters(state: ChannelState): void {
    this.options.onCounters?.(state.channel.key, { ...state.counters });
  }
}
