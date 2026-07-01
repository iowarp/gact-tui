/**
 * Normalized transcript-event reducer.
 *
 * This is the web/desktop consumer for the provider-agnostic stream contract:
 * turn.started, turn.trace.delta, turn.text.delta, turn.action.added,
 * call.result.delta, state.updated, and turn.completed. It folds those events
 * into the same flat TurnRow model used by AssistantTurnView.
 */
import type {
  TranscriptAction,
  TranscriptActionAddedPayload,
  TranscriptCallResultDeltaPayload,
  TranscriptStateUpdatedPayload,
  TranscriptTextDeltaPayload,
  TranscriptTraceDeltaPayload,
  TranscriptTurnCompletedPayload,
  TranscriptTurnStartedPayload,
} from '@clio/core';
import { analyzeToolResult } from './components/toolResultPreview.js';
import type {
  DelegationRow,
  ProviderThinking,
  ReasoningRow,
  ReturnRow,
  TextRow,
  ToolRow,
  TurnRow,
} from './components/transcriptDelegationModel.js';
import { dedupToolThought } from './components/transcriptDelegationModel.js';

export type NormalizedTranscriptEventType =
  | 'turn.started'
  | 'turn.trace.delta'
  | 'turn.text.delta'
  | 'turn.action.added'
  | 'call.result.delta'
  | 'turn.completed'
  | 'state.updated';

export interface NormalizedTranscriptModel {
  rows: TurnRow[];
  activityKey: string;
  hiddenStateByTurn: Record<string, Record<string, unknown>>;
}

export interface NormalizedTranscriptState extends NormalizedTranscriptModel {
  turns: Record<string, NormalizedTurn>;
  calls: Record<string, NormalizedCall>;
  agentDepths: Record<string, number>;
  firstRowIdByTurn: Record<string, string>;
  rowTurnById: Record<string, string>;
  latestTextRowIdByPart: Record<string, string>;
  /** Trace (provider thinking) accumulated since the LAST row of a turn was
   * created, keyed by turn_id. Consumed by the next row so each call/step shows
   * the reasoning that led to it (per-call thinking), not the whole turn's trace
   * duplicated onto every row. */
  pendingThinkingByTurn: Record<string, { text: string; tokens?: number }>;
  revision: number;
  visibleActivityCount: number;
}

interface NormalizedTurn {
  turnId: string;
  agentId: string;
  parentCallId?: string;
  depth: number;
  traceText: string;
  traceTokens?: number;
  completed?: boolean;
}

interface NormalizedCall {
  callId: string;
  kind: string;
  turnId: string;
  parentAgent: string;
  targetAgent?: string;
  toolName?: string;
  resultText: string;
  resultTokens?: number;
  rowId?: string;
  depth: number;
}

export function emptyNormalizedTranscriptState(): NormalizedTranscriptState {
  return {
    rows: [],
    activityKey: '0:0',
    hiddenStateByTurn: {},
    turns: {},
    calls: {},
    agentDepths: {},
    firstRowIdByTurn: {},
    rowTurnById: {},
    latestTextRowIdByPart: {},
    pendingThinkingByTurn: {},
    revision: 0,
    visibleActivityCount: 0,
  };
}

export function applyNormalizedTranscriptEvent(
  state: NormalizedTranscriptState,
  type: string | undefined,
  payload: Record<string, unknown>,
): NormalizedTranscriptState {
  if (!isNormalizedTranscriptEventType(type)) return state;
  const draft = cloneState(state);
  switch (type) {
    case 'turn.started':
      applyTurnStarted(draft, payload as unknown as TranscriptTurnStartedPayload);
      break;
    case 'turn.trace.delta':
      applyTraceDelta(draft, payload as unknown as TranscriptTraceDeltaPayload);
      break;
    case 'turn.text.delta':
      applyTextDelta(draft, payload as unknown as TranscriptTextDeltaPayload);
      break;
    case 'turn.action.added':
      applyActionAdded(draft, payload as unknown as TranscriptActionAddedPayload);
      break;
    case 'call.result.delta':
      applyCallResultDelta(draft, payload as unknown as TranscriptCallResultDeltaPayload);
      break;
    case 'turn.completed':
      applyTurnCompleted(draft, payload as unknown as TranscriptTurnCompletedPayload);
      break;
    case 'state.updated':
      applyStateUpdated(draft, payload as unknown as TranscriptStateUpdatedPayload);
      break;
  }
  draft.revision += 1;
  draft.activityKey = `${draft.revision}:${draft.visibleActivityCount}:${draft.rows.length}`;
  return draft;
}

export function isNormalizedTranscriptEventType(
  type: string | undefined,
): type is NormalizedTranscriptEventType {
  return (
    type === 'turn.started' ||
    type === 'turn.trace.delta' ||
    type === 'turn.text.delta' ||
    type === 'turn.action.added' ||
    type === 'call.result.delta' ||
    type === 'turn.completed' ||
    type === 'state.updated'
  );
}

function applyTurnStarted(
  state: NormalizedTranscriptState,
  payload: TranscriptTurnStartedPayload,
) {
  const turnId = str(payload.turn_id);
  if (!turnId) return;
  const agentId = str(payload.agent_id) || 'main';
  const parentCallId = str(payload.parent_call_id);
  const parentCall = parentCallId ? state.calls[parentCallId] : undefined;
  const depth = parentCall
    ? parentCall.depth + 1
    : (state.agentDepths[agentId] ?? state.turns[turnId]?.depth ?? 0);
  state.agentDepths[agentId] = depth;
  state.turns[turnId] = {
    ...(state.turns[turnId] ?? {}),
    turnId,
    agentId,
    ...(parentCallId ? { parentCallId } : {}),
    depth,
    traceText: state.turns[turnId]?.traceText ?? '',
    ...(state.turns[turnId]?.traceTokens != null
      ? { traceTokens: state.turns[turnId]!.traceTokens }
      : {}),
  };
}

function applyTraceDelta(
  state: NormalizedTranscriptState,
  payload: TranscriptTraceDeltaPayload,
) {
  if (payload.trace_kind !== 'model_aux') return;
  const append = raw(payload.text_append);
  if (!str(payload.turn_id) || !append) return;
  const turn = ensureTurn(state, payload.turn_id);
  turn.traceText += append; // cumulative trace (compat)
  if (typeof payload.tokens === 'number') {
    turn.traceTokens = (turn.traceTokens ?? 0) + payload.tokens;
  }
  // Stream the SDK thinking as a LIVE, collapsed `thinking ▾` HOST row: an
  // empty-text reasoning row (no ● body) whose providerThinking is the live
  // thinking. Created on the first delta of a burst and appended in place after,
  // so the count ticks per delta and the body streams when opened. A non-trace row
  // (text/tool) closes the burst, so the next trace opens a fresh host.
  const latest = state.rows.at(-1);
  const host =
    latest?.kind === 'reasoning' && latest.agent === turn.agentId && !latest.text.trim()
      ? (latest as ReasoningRow)
      : undefined;
  if (host?.providerThinking) {
    const text = host.providerThinking.text + append;
    host.providerThinking = {
      ...host.providerThinking,
      text,
      chars: text.length,
      ...(typeof payload.tokens === 'number'
        ? { tokens: (host.providerThinking.tokens ?? 0) + payload.tokens }
        : {}),
    };
    state.visibleActivityCount += 1;
  } else {
    const row: ReasoningRow = {
      kind: 'reasoning',
      id: `reasoning-${turn.turnId}-${turn.agentId}-${state.rows.length}`,
      depth: turn.depth,
      agent: turn.agentId,
      text: '',
      providerThinking: {
        text: append,
        source: 'provider',
        chars: append.length,
        ...(typeof payload.tokens === 'number' ? { tokens: payload.tokens } : {}),
      },
    };
    pushVisibleRow(state, turn.turnId, row);
  }
}

function applyTextDelta(
  state: NormalizedTranscriptState,
  payload: TranscriptTextDeltaPayload,
) {
  const turn = turnForAgentPayload(state, ensureTurn(state, payload.turn_id), payload.agent_id);
  const append = raw(payload.text_append);
  if (!append) return;
  const partId = str(payload.part_id);
  const rowIdBase = partId || `${payload.field}-${turn.turnId}-${turn.agentId}`;
  const latestRowId = state.latestTextRowIdByPart[rowIdBase] || rowIdBase;
  const latestRow = state.rows.at(-1);
  const existing =
    latestRow?.id === latestRowId && latestRow.kind === 'text'
      ? (latestRow as TextRow)
      : undefined;
  if (existing) {
    existing.text += append;
  } else {
    const rowId = state.rows.some((row) => row.id === rowIdBase)
      ? `${rowIdBase}-${state.rows.length}`
      : rowIdBase;
    const row: TextRow = {
      kind: 'text',
      id: rowId,
      depth: turn.depth,
      agent: turn.agentId,
      text: append,
    };
    state.latestTextRowIdByPart[rowIdBase] = row.id;
    pushVisibleRow(state, turn.turnId, row);
  }
}

function applyActionAdded(
  state: NormalizedTranscriptState,
  payload: TranscriptActionAddedPayload,
) {
  const turn = ensureTurn(state, payload.turn_id);
  const action = payload.action ?? {};
  const actionTurn = turnForAction(state, turn, action);
  const kind = actionKind(action);
  if (kind === 'agent_call') {
    applyAgentCallAction(state, actionTurn, action);
    return;
  }
  if (kind === 'tool_call') {
    applyToolCallAction(state, actionTurn, action);
    return;
  }
  if (kind === 'return') {
    applyReturnAction(state, actionTurn, action);
  }
}

function applyAgentCallAction(
  state: NormalizedTranscriptState,
  turn: NormalizedTurn,
  action: TranscriptAction,
) {
  const callId = str(action.call_id) || `agent-call-${turn.turnId}-${state.rows.length}`;
  const targetAgent = str(action.target_agent) || str(action.agent_id) || str(action.target) || 'agent';
  const row: DelegationRow = {
    kind: 'delegation',
    id: `delegation-${callId}`,
    depth: turn.depth,
    parent: turn.agentId,
    agent: targetAgent,
    task: str(action.prompt) || str(action.task) || str(action.next_task),
    status: str(action.status) || 'observed',
  };
  state.calls[callId] = {
    callId,
    kind: 'agent_call',
    turnId: turn.turnId,
    parentAgent: turn.agentId,
    targetAgent,
    resultText: '',
    rowId: row.id,
    depth: turn.depth,
  };
  state.agentDepths[targetAgent] = turn.depth + 1;
  pushVisibleRow(state, turn.turnId, row);
}

function applyToolCallAction(
  state: NormalizedTranscriptState,
  turn: NormalizedTurn,
  action: TranscriptAction,
) {
  const callId = str(action.call_id) || `tool-call-${turn.turnId}-${state.rows.length}`;
  const analysis = analyzeToolResult('');
  const row: ToolRow = {
    kind: 'tool',
    id: `tool-${callId}`,
    depth: turn.depth,
    agent: turn.agentId,
    // P1.3 dedup: drop the tool thought when it repeats a preceding text row —
    // parity with the persisted path's buildAssistantTurnModel.
    thought: dedupToolThought(state.rows, turn.agentId, str(action.thought)),
    name: str(action.tool_name) || str(action.name) || 'tool',
    argsSummary: summariseArgs(action.input ?? action.args),
    content: analysis.content,
    preview: analysis.preview,
    result: analysis.full,
    ok: action.is_error !== true,
  };
  state.calls[callId] = {
    callId,
    kind: 'tool_call',
    turnId: turn.turnId,
    parentAgent: turn.agentId,
    toolName: row.name,
    resultText: '',
    rowId: row.id,
    depth: turn.depth,
  };
  pushVisibleRow(state, turn.turnId, row);
}

function applyReturnAction(
  state: NormalizedTranscriptState,
  turn: NormalizedTurn,
  action: TranscriptAction,
) {
  const explicitCallId = str(action.call_id);
  // Dedup: the backend can describe one handoff on more than one channel; render
  // a given return exactly once (keyed on its call_id).
  if (explicitCallId) {
    const existing = state.calls[explicitCallId];
    if (existing?.kind === 'return' && state.rows.some((candidate) => candidate.id === existing.rowId)) {
      return;
    }
  }
  const callId = explicitCallId || `return-${turn.turnId}-${state.rows.length}`;
  const parentCall = turn.parentCallId ? state.calls[turn.parentCallId] : undefined;
  const text = str(action.summary) || str(action.text) || str(action.response);
  const rawText = str(action.response) || text;
  // Fold the agent's last live thinking host into the return's `thinking ▾` (the
  // reasoning that led to the return), removing the standalone host row so the
  // thinking shows on the return one-liner, not as a separate row above it.
  const thinking = foldThinkingHost(state, turn.agentId);
  const row: ReturnRow = {
    kind: 'return',
    id: `return-${callId}`,
    depth: turn.depth,
    agent: turn.agentId,
    parent: str(action.target_agent) || str(action.parent_agent) || parentCall?.parentAgent || 'main',
    text,
    raw: rawText,
    chars: rawText.length,
    ...(typeof action.tokens === 'number' ? { tokens: action.tokens } : {}),
    ...(thinking ? { providerThinking: thinking } : {}),
  };
  state.calls[callId] = {
    callId,
    kind: 'return',
    turnId: turn.turnId,
    parentAgent: row.parent,
    targetAgent: row.agent,
    resultText: rawText,
    rowId: row.id,
    depth: turn.depth,
  };
  pushVisibleRow(state, turn.turnId, row);
}

function applyCallResultDelta(
  state: NormalizedTranscriptState,
  payload: TranscriptCallResultDeltaPayload,
) {
  const callId = str(payload.call_id);
  const call = callId ? state.calls[callId] : undefined;
  if (!call?.rowId) return;
  const append = raw(payload.text_append) || valueAppendToText(payload.value_append);
  if (!append) return;
  call.resultText += append;
  if (typeof payload.tokens === 'number') call.resultTokens = (call.resultTokens ?? 0) + payload.tokens;
  const tool = findRow<ToolRow>(state, call.rowId, 'tool');
  if (tool) {
    const analysis = analyzeToolResult(call.resultText);
    tool.content = analysis.content;
    tool.preview = analysis.preview;
    tool.result = analysis.full;
    if (analysis.imagePath) tool.imagePath = analysis.imagePath;
    state.visibleActivityCount += 1;
    return;
  }
  const ret = findRow<ReturnRow>(state, call.rowId, 'return');
  if (ret) {
    ret.raw = call.resultText;
    ret.chars = call.resultText.length;
    if (call.resultTokens != null) ret.tokens = call.resultTokens;
    state.visibleActivityCount += 1;
  }
}

function applyTurnCompleted(
  state: NormalizedTranscriptState,
  payload: TranscriptTurnCompletedPayload,
) {
  const turn = ensureTurn(state, payload.turn_id);
  turn.completed = true;
}

function applyStateUpdated(
  state: NormalizedTranscriptState,
  payload: TranscriptStateUpdatedPayload,
) {
  if (payload.visibility !== 'hidden') return;
  const turnId = str(payload.turn_id);
  if (!turnId || !payload.value) return;
  state.hiddenStateByTurn[turnId] = {
    ...(state.hiddenStateByTurn[turnId] ?? {}),
    ...payload.value,
  };
}

function ensureTurn(state: NormalizedTranscriptState, turnIdRaw: unknown): NormalizedTurn {
  const turnId = str(turnIdRaw) || 'turn-main';
  const existing = state.turns[turnId];
  if (existing) return existing;
  const turn: NormalizedTurn = {
    turnId,
    agentId: 'main',
    depth: 0,
    traceText: '',
  };
  state.turns[turnId] = turn;
  return turn;
}

function pushVisibleRow(
  state: NormalizedTranscriptState,
  turnId: string,
  row: TurnRow,
) {
  if (!state.firstRowIdByTurn[turnId]) state.firstRowIdByTurn[turnId] = row.id;
  state.rowTurnById[row.id] = turnId;
  state.rows.push(row);
  state.visibleActivityCount += 1;
}

/** Fold the agent's most-recent LIVE thinking host (an empty-text reasoning row)
 * into a return, removing the standalone host row so the thinking renders on the
 * return one-liner. Searches back from the latest row, not crossing a prior
 * return/delegation boundary. */
function foldThinkingHost(
  state: NormalizedTranscriptState,
  agentId: string,
): ProviderThinking | undefined {
  for (let i = state.rows.length - 1; i >= 0; i--) {
    const row = state.rows[i]!;
    if (
      row.kind === 'reasoning' &&
      row.agent === agentId &&
      !row.text.trim() &&
      row.providerThinking
    ) {
      const folded = row.providerThinking;
      state.rows.splice(i, 1);
      delete state.rowTurnById[row.id];
      return folded;
    }
    if (row.kind === 'return' || row.kind === 'delegation') break;
  }
  return undefined;
}

function cloneState(state: NormalizedTranscriptState): NormalizedTranscriptState {
  return {
    rows: state.rows.map((row) => ({ ...row })),
    activityKey: state.activityKey,
    hiddenStateByTurn: { ...state.hiddenStateByTurn },
    turns: Object.fromEntries(Object.entries(state.turns).map(([key, turn]) => [key, { ...turn }])),
    calls: Object.fromEntries(Object.entries(state.calls).map(([key, call]) => [key, { ...call }])),
    agentDepths: { ...state.agentDepths },
    firstRowIdByTurn: { ...state.firstRowIdByTurn },
    rowTurnById: { ...state.rowTurnById },
    latestTextRowIdByPart: { ...state.latestTextRowIdByPart },
    pendingThinkingByTurn: { ...state.pendingThinkingByTurn },
    revision: state.revision,
    visibleActivityCount: state.visibleActivityCount,
  };
}

function findRow<T extends TurnRow>(
  state: NormalizedTranscriptState,
  id: string,
  kind: T['kind'],
): T | undefined {
  return state.rows.find((row): row is T => row.id === id && row.kind === kind);
}

function actionKind(action: TranscriptAction): string {
  return str(action.kind) || str(action.type);
}

function turnForAction(
  state: NormalizedTranscriptState,
  turn: NormalizedTurn,
  action: TranscriptAction,
): NormalizedTurn {
  const agentId = str(action.agent_id) || turn.agentId;
  return turnForAgentPayload(state, turn, agentId);
}

function turnForAgentPayload(
  state: NormalizedTranscriptState,
  turn: NormalizedTurn,
  agentIdRaw: unknown,
): NormalizedTurn {
  const agentId = str(agentIdRaw) || turn.agentId;
  if (agentId === turn.agentId) return turn;
  const depth = state.agentDepths[agentId] ?? turn.depth;
  state.agentDepths[agentId] = depth;
  return {
    ...turn,
    agentId,
    depth,
  };
}

function summariseArgs(args: unknown): string {
  if (args == null) return '';
  if (typeof args === 'string') return clip(args, 160);
  if (typeof args !== 'object') return clip(String(args), 160);
  return clip(
    Object.entries(args as Record<string, unknown>)
      .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
      .join(' | '),
    180,
  );
}

function valueAppendToText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function raw(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function clip(value: string, max: number): string {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}
