import {
  decodeEventEnvelope,
  type ClioRepository,
  type McpAppIdentity,
  type McpAppToolCallEvent,
  type McpAppViewTool,
  type TransportFrame,
} from '@clio/core/v3';
import { mcpAppEnded } from './mcp-app-live-set';

/** MA14: the limits Claude publishes for app tools. A view over either offers none. */
export const MAX_VIEW_TOOLS = 64;
export const MAX_VIEW_TOOL_SCHEMA_BYTES = 64 * 1024;

export const MCP_APP_TOOL_CALL_EVENT = 'mcp_app_tool_call';

type ViewToolsClient = Pick<ClioRepository, 'updateMcpAppTools' | 'postMcpAppToolResult'>;

type CallHandler = (call: McpAppToolCallEvent) => void;

const callHandlers = new Map<string, CallHandler>();

function handlerKey(sessionId: string, appInstanceId: string): string {
  return `${sessionId}:${appInstanceId}`;
}

/** Hand a streamed `mcp_app_tool_call` to the surface holding that app, if one does. */
export function dispatchMcpAppToolCallFrame(frame: TransportFrame): void {
  if (frame.eventName !== MCP_APP_TOOL_CALL_EVENT) return;
  let payload: unknown;
  try {
    payload = decodeEventEnvelope(frame.data).payload;
  } catch {
    return; // Frame reduction owns malformed-envelope reporting.
  }
  const call = toolCall(payload);
  if (!call) return;
  callHandlers.get(handlerKey(call.session_id, call.app_instance_id))?.(call);
}

function toolCall(value: unknown): McpAppToolCallEvent | undefined {
  if (!isRecord(value)) return undefined;
  const { session_id, app_instance_id, call_id, name } = value;
  if (
    typeof session_id !== 'string' ||
    typeof app_instance_id !== 'string' ||
    typeof call_id !== 'string' ||
    typeof name !== 'string'
  ) {
    return undefined;
  }
  const args = isRecord(value.arguments) ? value.arguments : {};
  return { session_id, app_instance_id, call_id, name, arguments: args };
}

/** Why a view's list is not offered, or undefined when it fits the limits. */
export function viewToolsOverLimit(tools: readonly McpAppViewTool[]): string | undefined {
  if (tools.length > MAX_VIEW_TOOLS) {
    return `the view lists ${tools.length} tools; at most ${MAX_VIEW_TOOLS} are offered`;
  }
  for (const tool of tools) {
    const size = new TextEncoder().encode(JSON.stringify(tool.inputSchema ?? {})).length;
    if (size > MAX_VIEW_TOOL_SCHEMA_BYTES) {
      return `the input schema of ${tool.name} is over ${MAX_VIEW_TOOL_SCHEMA_BYTES / 1024} KiB`;
    }
  }
  return undefined;
}

/**
 * The host side of a view's own tools (draft "App-Provided Tools"): `tools/list` and
 * `tools/call` sent to the view, its `notifications/tools/list_changed`, and the agent's
 * calls that arrive as `mcp_app_tool_call` session events.
 */
export class McpAppViewTools {
  private readonly handled = new Set<string>();
  /** Which mount of the view this is: a late withdrawal never clears a newer mount's list. */
  private readonly holder = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  private offersTools = false;
  private published = false;
  private stopped = false;
  private unregister?: () => void;

  constructor(
    private readonly repository: ViewToolsClient,
    private readonly identity: McpAppIdentity,
    /** A request to the view over the surface's channel (it settles or the frame closes). */
    private readonly ask: (method: string, params: Record<string, unknown>) => Promise<unknown>,
  ) {}

  /** `ui/initialize` said whether the view has the `tools` capability. */
  declare(appCapabilities: unknown): void {
    this.offersTools = isRecord(appCapabilities) && isRecord(appCapabilities.tools);
  }

  /** After `ui/notifications/initialized`: list the view's tools and listen for calls. */
  start(): void {
    if (this.stopped) return;
    if (!this.offersTools) {
      // The view has no tools of its own: say so once, so a call to a tool of an earlier
      // view of this server does not wait for this one to list any.
      void this.repository.updateMcpAppTools(this.identity, [], this.holder).catch(() => undefined);
      return;
    }
    const key = handlerKey(this.identity.sessionId, this.identity.appInstanceId);
    const handler: CallHandler = (call) => void this.runAgentCall(call);
    callHandlers.set(key, handler);
    // A newer mount of the same App (the frame moved between card and tab) may already
    // hold the key: only this mount's own handler leaves with it.
    this.unregister = () => {
      if (callHandlers.get(key) === handler) callHandlers.delete(key);
    };
    void this.refresh();
  }

  /** `notifications/tools/list_changed` from the view. */
  async refresh(): Promise<void> {
    if (!this.offersTools || this.stopped) return;
    let tools: McpAppViewTool[];
    try {
      tools = viewTools(await this.request('tools/list', {}));
    } catch (error) {
      console.warn('The view did not list its tools:', error);
      return;
    }
    const overLimit = viewToolsOverLimit(tools);
    if (overLimit) {
      console.warn(`The view's tools are not offered to the agent: ${overLimit}.`);
      tools = [];
    }
    if (this.stopped) return;
    this.published = true;
    await this.repository
      .updateMcpAppTools(this.identity, tools, this.holder)
      .catch((error: unknown) => {
        console.warn('The view tools could not be offered:', error);
      });
  }

  /** Run one of the view's tools (the imperative `callAppTool` handle). */
  callAppTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.request('tools/call', { name, arguments: args });
  }

  /** The frame is going: withdraw the tools (the surface fails what waits on the view). */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.unregister?.();
    // A closed App's tools left with it on the server; its record answers 404 now.
    if (this.published && !mcpAppEnded(this.identity.appInstanceId)) {
      void this.repository.updateMcpAppTools(this.identity, [], this.holder).catch(() => undefined);
    }
  }

  private async runAgentCall(call: McpAppToolCallEvent): Promise<void> {
    if (this.handled.has(call.call_id) || this.stopped) return;
    this.handled.add(call.call_id);
    let answer: { result: Record<string, unknown> } | { error: { message: string } };
    try {
      const result = await this.callAppTool(call.name, call.arguments);
      answer = { result: isRecord(result) ? result : { content: [] } };
    } catch (error) {
      answer = { error: { message: error instanceof Error ? error.message : String(error) } };
    }
    await this.repository
      .postMcpAppToolResult(this.identity, call.call_id, answer)
      .catch((error: unknown) => console.warn('The view tool result was not delivered:', error));
  }

  private request(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (this.stopped) return Promise.reject(new Error('The view closed.'));
    return this.ask(method, params);
  }
}

function viewTools(result: unknown): McpAppViewTool[] {
  const tools = isRecord(result) && Array.isArray(result.tools) ? result.tools : [];
  return tools.flatMap((tool): McpAppViewTool[] => {
    if (!isRecord(tool) || typeof tool.name !== 'string' || !tool.name) return [];
    return [
      {
        name: tool.name,
        ...(typeof tool.description === 'string' ? { description: tool.description } : {}),
        ...(isRecord(tool.inputSchema) ? { inputSchema: tool.inputSchema } : {}),
        ...(isRecord(tool.annotations) ? { annotations: tool.annotations } : {}),
      },
    ];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
