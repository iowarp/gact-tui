import type {
  Message,
  SemanticEventPayload,
  SessionAgentTask,
  SessionArtifactRecord,
  SessionArtifactVersion,
  SessionTraceEvent,
} from '@clio/core';
import type {
  ObsArtifactRow,
  ObsSpan,
  ObsSpanState,
  ObsTimelineKind,
  ObsTimelineRow,
} from './types';

const TERMINAL_TASK_STATES = new Set([
  'cancelled',
  'canceled',
  'completed',
  'done',
  'error',
  'failed',
  'succeeded',
]);
const FAILED_TASK_STATES = new Set(['cancelled', 'canceled', 'error', 'failed']);

interface PartEntry {
  message: Message;
  part: Record<string, unknown>;
  messageIndex: number;
  partIndex: number;
  atMs: number | null;
  partAtMs: number | null;
}

export interface ObservabilityTraceInput {
  messages: Message[];
  agentTasks: SessionAgentTask[];
  artifacts: SessionArtifactRecord[];
}

export interface ObservabilityTrace {
  timeline: ObsTimelineRow[];
  spans: ObsSpan[];
  artifactRows: ObsArtifactRow[];
}

/** Build history from transcript parts, plus task spans and artifact records. */
export function buildObservabilityTrace({
  messages,
  agentTasks,
  artifacts,
}: ObservabilityTraceInput): ObservabilityTrace {
  const entries = messagePartEntries(messages);
  const resultByCall = toolResultsByCall(entries);
  const versions = artifacts.map(latestArtifactVersion).filter(isPresent);
  const timeline = entries
    .map((entry) => toHistoryTimelineRow(entry, resultByCall))
    .filter(isPresent);
  const reconstructedSpans = reconstructPartSpans(entries, resultByCall);
  const spansById = new Map(reconstructedSpans.map((span) => [span.id, span]));

  for (const span of agentTasks.map((task) => toTaskSpan(task, versions)).filter(isPresent)) {
    spansById.set(span.id, span);
  }

  return {
    timeline,
    spans: [...spansById.values()],
    artifactRows: versions.map((entry) => toArtifactRow(entry.record, entry.version, agentTasks)),
  };
}

/** Map one filtered session SSE event to a visible trace row. */
export function timelineRowFromSessionTraceEvent(event: SessionTraceEvent): ObsTimelineRow {
  if (event.type === 'session.status_changed') {
    const status = event.payload.status;
    return {
      ...withTime(event.occurred_at),
      actor: 'session',
      action: `status changed to ${status}`,
      kind: semanticKind('session.status_changed', status),
      sourceId: `status:${event.occurred_at}:${status}`,
    };
  }

  const payload = event.payload;
  const eventType = visibleString(payload.event_type) ?? 'semantic.event';
  const duration = explicitDuration(payload);
  return {
    ...withTime(event.occurred_at),
    actor: semanticActor(payload) ?? eventType,
    action: visibleString(payload.summary) ?? eventType.replace(/[._-]+/g, ' '),
    kind: semanticKind(eventType, payload.status),
    ...(duration ? { duration } : {}),
    ...(finiteNumber(payload['depth']) !== null ? { depth: finiteNumber(payload['depth'])! } : {}),
    sourceId: payload.event_id,
  };
}

function semanticActor(payload: SemanticEventPayload): string | null {
  const actor = payload.actor;
  if (!actor) return null;
  for (const field of ['agent_id', 'tool_name', 'role', 'component', 'name', 'id']) {
    const value = visibleString(actor[field]);
    if (value) return value;
  }
  return null;
}

function semanticKind(eventType: string, status: unknown): ObsTimelineKind {
  const value = `${eventType} ${String(status ?? '')}`.toLowerCase();
  if (/fail|error|blocked|cancel/.test(value)) return 'failure';
  if (/artifact|dataset|resource|file/.test(value)) return 'artifact';
  if (/tool|call/.test(value)) return 'tool';
  if (/running|started|pending|queued/.test(value)) return 'running';
  return 'event';
}

function messagePartEntries(messages: Message[]): PartEntry[] {
  return messages.flatMap((message, messageIndex) =>
    message.parts.map((rawPart, partIndex) => {
      const part = rawPart as unknown as Record<string, unknown>;
      const partAtMs = recordTimestamp(part);
      return {
        message,
        part,
        messageIndex,
        partIndex,
        partAtMs,
        atMs: partAtMs ?? parseTimestamp(message.created_at ?? message.updated_at),
      };
    }),
  );
}

function toolResultsByCall(entries: PartEntry[]): Map<string, PartEntry> {
  const results = new Map<string, PartEntry>();
  for (const entry of entries) {
    if (entry.part['type'] !== 'tool_result') continue;
    const callId = visibleString(entry.part['call_id'] ?? entry.part['tool_call_id']);
    if (callId) results.set(callId, entry);
  }
  return results;
}

function toHistoryTimelineRow(
  entry: PartEntry,
  resultByCall: Map<string, PartEntry>,
): ObsTimelineRow | null {
  const type = visibleString(entry.part['type']);
  if (!type) return null;
  const sourceId = historySourceId(entry);
  const depth = partDepth(entry.part);
  const common = {
    ...withTime(entry.atMs),
    ...(depth !== null ? { depth } : {}),
    sourceId,
  };

  if (type === 'expert_handoff') {
    const stage = visibleString(entry.part['stage']);
    if (stage !== 'delegate.started' && stage !== 'delegate.completed') return null;
    const actor =
      visibleString(entry.part['child_agent'] ?? entry.part['run_label'] ?? entry.part['expert']) ??
      'child agent';
    const parent = visibleString(entry.part['parent_agent']) ?? 'parent';
    const duration = explicitDuration(entry.part);
    const status = visibleString(entry.part['status'] ?? entry.part['live_state']);
    return {
      ...common,
      actor,
      action: stage === 'delegate.started' ? 'task started' : `returned to ${parent}`,
      kind:
        status && FAILED_TASK_STATES.has(status.toLowerCase())
          ? 'failure'
          : stage === 'delegate.started'
            ? 'running'
            : 'event',
      ...(duration ? { duration } : {}),
    };
  }

  if (type === 'tool_call') {
    const callId = visibleString(entry.part['call_id'] ?? entry.part['id']);
    const result = callId ? resultByCall.get(callId) : undefined;
    const duration = explicitDuration(result?.part ?? entry.part);
    const failed = result?.part['is_error'] === true;
    return {
      ...common,
      actor: visibleString(entry.part['tool_name'] ?? entry.part['name']) ?? 'tool',
      action: 'tool call',
      kind: failed ? 'failure' : 'tool',
      ...(duration ? { duration } : {}),
    };
  }

  if (type === 'background_exit') {
    const status =
      visibleString(
        entry.part['exit_status'] ?? entry.part['status'] ?? entry.part['live_state'],
      ) ?? 'unknown';
    return {
      ...common,
      actor:
        visibleString(
          entry.part['run_label'] ?? entry.part['child_agent'] ?? entry.part['handle_id'],
        ) ?? 'background task',
      action: `exited (${status})`,
      kind: FAILED_TASK_STATES.has(status.toLowerCase()) ? 'failure' : 'event',
    };
  }

  if (isArtifactPart(type)) {
    const actor = artifactPartName(entry.part, type);
    if (!actor) return null;
    return {
      ...common,
      actor,
      action: artifactPartAction(type),
      kind: 'artifact',
    };
  }

  return null;
}

function historySourceId(entry: PartEntry): string {
  const partId = visibleString(entry.part['id']);
  return `part:${entry.message.id}:${partId ?? `${entry.messageIndex}:${entry.partIndex}`}`;
}

function isArtifactPart(type: string): boolean {
  return (
    type === 'resource_link' ||
    type === 'resource' ||
    type === 'document' ||
    type === 'file_diff' ||
    type === 'artifact' ||
    type === 'artifact_ref'
  );
}

function artifactPartName(part: Record<string, unknown>, type: string): string | null {
  const direct = visibleString(part['name'] ?? part['title'] ?? part['path']);
  if (direct) return direct;
  const uri = visibleString(part['uri'] ?? part['artifact_ref']);
  if (!uri) return type.replace(/_/g, ' ');
  const tail = uri.split('/').at(-1)?.split('@')[0];
  return tail || uri;
}

function artifactPartAction(type: string): string {
  if (type === 'file_diff') return 'file diff';
  if (type === 'document') return 'document';
  return 'artifact';
}

function reconstructPartSpans(
  entries: PartEntry[],
  resultByCall: Map<string, PartEntry>,
): ObsSpan[] {
  const completions = new Map<string, PartEntry>();
  for (const entry of entries) {
    const type = entry.part['type'];
    if (
      (type === 'expert_handoff' && entry.part['stage'] === 'delegate.completed') ||
      type === 'background_exit'
    ) {
      const key = handoffKey(entry.part);
      if (key) completions.set(key, entry);
    }
  }

  const spans: ObsSpan[] = [];
  for (const entry of entries) {
    if (entry.part['type'] === 'expert_handoff' && entry.part['stage'] === 'delegate.started') {
      const key = handoffKey(entry.part);
      if (!key || entry.atMs === null) continue;
      const completion = completions.get(key);
      if (!completion) {
        spans.push({
          id: key,
          label: visibleString(entry.part['run_label'] ?? entry.part['child_agent']) ?? key,
          depth: partDepth(entry.part) ?? 0,
          startMs: entry.atMs,
          endMs: null,
          state: 'running',
        });
        continue;
      }

      const endMs = derivedEndMs(entry.atMs, completion);
      if (endMs === null) continue;
      const state = partTerminalState(completion.part);
      spans.push({
        id: key,
        label: visibleString(entry.part['run_label'] ?? entry.part['child_agent']) ?? key,
        depth: partDepth(entry.part) ?? 0,
        startMs: entry.atMs,
        endMs,
        state,
        duration: formatDuration(endMs - entry.atMs),
      });
    }

    if (entry.part['type'] !== 'tool_call' || entry.atMs === null) continue;
    const callId = visibleString(entry.part['call_id'] ?? entry.part['id']);
    if (!callId) continue;
    const result = resultByCall.get(callId);
    const label = visibleString(entry.part['tool_name'] ?? entry.part['name']) ?? callId;
    if (!result) {
      spans.push({
        id: `tool:${callId}`,
        label,
        depth: partDepth(entry.part) ?? 0,
        startMs: entry.atMs,
        endMs: null,
        state: 'running',
        tool: true,
      });
      continue;
    }

    const endMs = derivedEndMs(entry.atMs, result);
    if (endMs === null) continue;
    spans.push({
      id: `tool:${callId}`,
      label,
      depth: partDepth(entry.part) ?? 0,
      startMs: entry.atMs,
      endMs,
      state: result.part['is_error'] === true ? 'failed' : 'done',
      duration: formatDuration(endMs - entry.atMs),
      tool: true,
    });
  }

  return spans;
}

function handoffKey(part: Record<string, unknown>): string | null {
  return visibleString(
    part['handle_id'] ?? part['task_id'] ?? part['run_label'] ?? part['child_agent'],
  );
}

function derivedEndMs(startMs: number, completion: PartEntry): number | null {
  const durationMs = explicitDurationMs(completion.part);
  if (durationMs !== null) return startMs + durationMs;
  if (completion.partAtMs !== null && completion.partAtMs >= startMs) return completion.partAtMs;
  if (completion.atMs !== null && completion.atMs > startMs) return completion.atMs;
  return null;
}

function partTerminalState(part: Record<string, unknown>): ObsSpanState {
  const status = visibleString(part['exit_status'] ?? part['status'] ?? part['live_state']);
  return status && FAILED_TASK_STATES.has(status.toLowerCase()) ? 'failed' : 'done';
}

function toTaskSpan(
  task: SessionAgentTask,
  versions: Array<{ record: SessionArtifactRecord; version: SessionArtifactVersion }>,
): ObsSpan | null {
  const startMs = parseTimestamp(task.created_at);
  if (startMs === null) return null;

  const state = taskState(task);
  const parsedEnd =
    state === 'running' ? null : parseTimestamp(task.completed_at ?? task.updated_at);
  const endMs = parsedEnd !== null && parsedEnd >= startMs ? parsedEnd : null;
  if (state !== 'running' && endMs === null) return null;
  const artifactAtMs = versions
    .filter(({ version }) => version.producer?.session_id === task.child_session_id)
    .map(({ version }) => parseTimestamp(version.created_at))
    .filter(isPresent);
  const id = task.task_id || task.id || `task-${startMs}`;
  const label = task.run_label || task.agent_ref?.expert_id || id;

  return {
    id,
    label,
    depth: finiteNumber(task.depth) ?? 0,
    startMs,
    endMs,
    state,
    ...(endMs !== null ? { duration: formatDuration(endMs - startMs) } : {}),
    ...(artifactAtMs.length > 0 ? { artifacts: artifactAtMs.length, artifactAtMs } : {}),
  };
}

function taskState(task: SessionAgentTask): ObsSpanState {
  const value = String(task.status || task.live_state || '').toLowerCase();
  if (FAILED_TASK_STATES.has(value)) return 'failed';
  return TERMINAL_TASK_STATES.has(value) ? 'done' : 'running';
}

function latestArtifactVersion(
  record: SessionArtifactRecord,
): { record: SessionArtifactRecord; version: SessionArtifactVersion } | null {
  if (record.versions.length === 0) return null;
  const version =
    record.versions.find((item) => item.artifact_id === record.head_artifact_id) ??
    record.versions.find((item) => item.version === record.latest_version) ??
    [...record.versions].sort((left, right) => right.version - left.version)[0];
  return version ? { record, version } : null;
}

function toArtifactRow(
  record: SessionArtifactRecord,
  version: SessionArtifactVersion,
  tasks: SessionAgentTask[],
): ObsArtifactRow {
  return {
    ...withTime(version.created_at),
    name: record.name || version.name,
    producer: artifactProducer(version, tasks),
    meta: artifactMeta(record, version),
  };
}

function artifactProducer(version: SessionArtifactVersion, tasks: SessionAgentTask[]): string {
  const producer = version.producer;
  if (!producer) return 'producer unavailable';
  const task = tasks.find((item) => item.child_session_id === producer.session_id);
  const path = [
    task?.agent_ref?.requesting_expert_id,
    task?.agent_ref?.expert_id,
    producer.tool,
  ].filter((part): part is string => Boolean(part));
  if (path.length > 0) return [...new Set(path)].join(' / ');
  return producer.session_id || producer.call_id || 'producer unavailable';
}

function artifactMeta(record: SessionArtifactRecord, version: SessionArtifactVersion): string {
  if (typeof version.size_bytes === 'number' && Number.isFinite(version.size_bytes)) {
    return formatBytes(version.size_bytes);
  }
  return version.kind || record.kind || `v${version.version}`;
}

function explicitDuration(record: Record<string, unknown>): string | null {
  const duration = visibleString(record['duration']);
  if (duration) return duration;
  const durationMs = explicitDurationMs(record);
  if (durationMs !== null) return formatDuration(durationMs);
  const durationSeconds = finiteNumber(record['duration_seconds']);
  return durationSeconds !== null ? formatDuration(durationSeconds * 1_000) : null;
}

function explicitDurationMs(record: Record<string, unknown>): number | null {
  const direct = finiteNumber(record['duration_ms']);
  if (direct !== null && direct >= 0) return direct;
  for (const containerName of ['payload', 'metadata']) {
    const container = record[containerName];
    if (!container || typeof container !== 'object' || Array.isArray(container)) continue;
    const nested = finiteNumber((container as Record<string, unknown>)['duration_ms']);
    if (nested !== null && nested >= 0) return nested;
  }
  return null;
}

function recordTimestamp(record: Record<string, unknown>): number | null {
  for (const field of ['occurred_at', 'created_at', 'updated_at', 'timestamp']) {
    const value = parseTimestamp(record[field]);
    if (value !== null) return value;
  }
  const metadata = record['metadata'];
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  for (const field of ['occurred_at', 'created_at', 'updated_at', 'timestamp']) {
    const value = parseTimestamp((metadata as Record<string, unknown>)[field]);
    if (value !== null) return value;
  }
  return null;
}

function partDepth(part: Record<string, unknown>): number | null {
  const direct = finiteNumber(part['depth']);
  if (direct !== null) return direct;
  const metadata = part['metadata'];
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  return finiteNumber((metadata as Record<string, unknown>)['depth']);
}

function withTime(value: unknown): { at?: string } {
  const timestamp =
    typeof value === 'number' && Number.isFinite(value) ? value : parseTimestamp(value);
  const at = formatLocalTime(timestamp);
  return at ? { at } : {};
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatLocalTime(timestamp: number | null): string | null {
  if (timestamp === null) return null;
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(timestamp);
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) return `${Math.round(durationMs)}ms`;
  const seconds = Math.round(durationMs / 1_000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return remaining === 0 ? `${minutes}m` : `${minutes}m ${remaining}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1_000) return `${Math.round(bytes)} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1_000).toLocaleString('en-US')} KB`;
  const megabytes = bytes / 1_000_000;
  return `${megabytes >= 10 ? Math.round(megabytes) : megabytes.toFixed(1)} MB`;
}

function visibleString(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  return /^\[redacted\](?::\d+ chars)?$/i.test(value) ? null : value;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}
