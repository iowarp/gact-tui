import {
  messageSchema,
  modelChoiceSchema,
  subagentSchema,
  toolInvocationSchema,
  type Message,
  type ModelChoice,
  type PendingInteraction,
  type SubagentRun,
  type ToolInvocation,
} from '@clio/core/v3';
import { subagentsForTool } from '@/components/clio/subagent-tool-link';
import { useScienceLog } from '@/hooks/use-science-log';
import type { ArchiveTranscriptView } from './archive-conversation';

/** How a descendant was reached, as the export recorded it. */
export interface ArchiveRelationship {
  session_id: string;
  parent_session_id: string;
  depth?: number;
  attribution?: string;
  task_id?: string;
}

export interface ArchiveSessionRow {
  session: { id: string; title: string };
  relationship?: ArchiveRelationship;
}

/** Where to go in the archive: a session's section, or one message (and call) in it. */
export interface ArchiveTarget {
  sessionId: string;
  messageId?: string;
  callId?: string;
}

/** The DOM id of a message row, as the conversation renders it. */
export function archiveMessageDomId(messageId: string): string {
  return `message-${messageId}`;
}

export function decodedMessages(view: ArchiveTranscriptView | undefined): Message[] {
  return (view?.messages ?? []).flatMap((value) => {
    const result = messageSchema.safeParse(value);
    return result.success ? [result.data] : [];
  });
}

function decodedTools(view: ArchiveTranscriptView | undefined): ToolInvocation[] {
  return (view?.tools ?? []).flatMap((value) => {
    const result = toolInvocationSchema.safeParse(value);
    return result.success ? [result.data] : [];
  });
}

/**
 * The spawn behind a child session: the parent's subagent record for it and the
 * parent message that shows that spawn, when the parent's transcript has one.
 */
export function archiveSubagentSpawn(
  childId: string,
  parentView: ArchiveTranscriptView | undefined,
): { subagent?: SubagentRun; messageId?: string } {
  const subagent = (parentView?.subagents ?? [])
    .flatMap((value) => {
      const result = subagentSchema.safeParse(value);
      return result.success ? [result.data] : [];
    })
    .find((row) => row.child_session_id === childId);
  if (!subagent) return {};
  const tools = new Map(decodedTools(parentView).map((tool) => [tool.id, tool] as const));
  const byId = { [subagent.id]: subagent };
  const message = decodedMessages(parentView).find((row) =>
    row.blocks.some(
      (block) =>
        (block.type === 'subagent' && block.subagent_id === subagent.id) ||
        (block.type === 'tool' && subagentsForTool(tools.get(block.tool_id), byId).length > 0),
    ),
  );
  return { subagent, messageId: message?.id };
}

/** A child session as the call that started it recorded it. */
export interface ArchiveSpawnCall {
  /** The session that made the call, the call and the message that shows it. */
  sessionId: string;
  callId: string;
  messageId?: string;
  childSessionId: string;
  /** A fork copies its caller; any other spawn delegates to a new agent. */
  forked: boolean;
  /** The flow the call ran (`workflow`, `council`, ...), when it started a flow's run. */
  flow?: string;
  /** The agent asked for, when the call named one. */
  agent?: string;
  /** The model the child ran on and why, when the call reports it. */
  model?: ModelChoice;
  /** What the child was asked: its assignment, or a fork's note. */
  assignment?: string;
  startedAt?: string;
}

/** Calls that start a child session: a delegated agent, a batch of them, or a flow's run. */
const SPAWN_TOOLS = new Set([
  'spawn_agent_task',
  'spawn_skill_task',
  'spawn_agents_parallel',
  'run_flow',
  'run_workflow',
]);

function record(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'string' && /^\s*[{[]/u.test(value)) {
    try {
      return record(JSON.parse(value));
    } catch {
      return undefined;
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined);

/** The children one recorded call started, each with what the call says about it. */
function spawnCalls(
  sessionId: string,
  tool: ToolInvocation,
): Omit<ArchiveSpawnCall, 'messageId'>[] {
  const forked = tool.name === 'fork';
  if (!forked && !SPAWN_TOOLS.has(tool.name)) return [];
  const input = record(tool.input) ?? {};
  const output = record(tool.output);
  if (!output) return [];
  // A batch returns one outcome per requested assignment, in order.
  const batch = tool.name === 'spawn_agents_parallel';
  const requests = batch && Array.isArray(input['spawns']) ? input['spawns'] : [];
  const entries = batch
    ? Array.isArray(output['spawned'] ?? output['outcomes'])
      ? ((output['spawned'] ?? output['outcomes']) as unknown[])
      : []
    : [output];
  return entries.flatMap((value, index) => {
    const entry = record(value);
    const child = text(entry?.['session_id']);
    if (!entry || !child || child === sessionId) return [];
    const request = batch ? (record(requests[index]) ?? {}) : input;
    const model = modelChoiceSchema.safeParse(entry['model']);
    return [
      {
        sessionId,
        callId: tool.id,
        childSessionId: child,
        forked,
        flow:
          tool.name === 'run_workflow'
            ? 'workflow'
            : tool.name === 'run_flow'
              ? (text(entry['flow']) ?? text(input['flow']) ?? 'flow')
              : undefined,
        agent: text(entry['agent']) ?? text(request['agent']) ?? text(request['skill']),
        model: model.success ? model.data : undefined,
        // A workflow's assignment is its whole definition; its task says what it was for.
        assignment: forked
          ? (text(entry['note']) ?? text(input['note']))
          : tool.name === 'run_workflow'
            ? (text(input['task']) ?? text(entry['assignment']))
            : (text(entry['assignment']) ?? text(request['task'])),
        startedAt: tool.started_at,
      },
    ];
  });
}

/**
 * Every spawn and fork the exported sessions recorded, by the child session it
 * started. A fork copies its caller's transcript, calls included; a call is kept
 * where it was made (the earliest record), not where a copy repeats it.
 */
export function archiveSpawnCalls(
  views: Readonly<Record<string, ArchiveTranscriptView>>,
): Map<string, ArchiveSpawnCall> {
  const calls = new Map<string, ArchiveSpawnCall>();
  for (const [sessionId, view] of Object.entries(views)) {
    const messages = decodedMessages(view);
    for (const tool of decodedTools(view)) {
      for (const call of spawnCalls(sessionId, tool)) {
        const known = calls.get(call.childSessionId);
        if (known && (known.startedAt ?? '') <= (call.startedAt ?? '')) continue;
        const message = messages.find((row) =>
          row.blocks.some((block) => block.type === 'tool' && block.tool_id === tool.id),
        );
        calls.set(call.childSessionId, { ...call, messageId: message?.id });
      }
    }
  }
  return calls;
}

/** What a delegated session was asked, as the delegation handed it over. */
export function archiveDelegatedAssignment(
  view: ArchiveTranscriptView | undefined,
): string | undefined {
  for (const message of decodedMessages(view)) {
    for (const block of message.blocks) {
      if (block.type === 'injection' && block.source === 'delegation' && block.text.trim())
        return block.text.trim();
    }
  }
  return undefined;
}

/** The answer a session ended with: the last answer text of its last reply. */
export function archiveFinalAnswer(view: ArchiveTranscriptView | undefined): string | undefined {
  for (const message of [...decodedMessages(view)].reverse()) {
    if (message.role !== 'assistant') continue;
    const answer = message.blocks
      .filter(
        (block): block is Extract<typeof block, { type: 'text' }> =>
          block.type === 'text' && (!block.channel || block.channel === 'answer'),
      )
      .map((block) => block.text.trim())
      .filter(Boolean)
      .at(-1);
    if (answer) return answer;
  }
  return undefined;
}

/**
 * Sessions in reading order: each child after its parent, below the session
 * whose call started it (a fork under the session it copies), siblings in the
 * order they started.
 */
export function archiveSessionOrder<
  T extends { session: { id: string; created_at?: string }; relationship?: ArchiveRelationship },
>(rows: readonly T[], calls: ReadonlyMap<string, ArchiveSpawnCall>): T[] {
  const ids = new Set(rows.map((row) => row.session.id));
  const parentOf = (row: T) => {
    const caller = calls.get(row.session.id)?.sessionId;
    const parent = caller && ids.has(caller) ? caller : row.relationship?.parent_session_id;
    return parent && ids.has(parent) && parent !== row.session.id ? parent : undefined;
  };
  const children = new Map<string | undefined, T[]>();
  for (const row of rows) {
    const parent = parentOf(row);
    children.set(parent, [...(children.get(parent) ?? []), row]);
  }
  const started = (row: T) => calls.get(row.session.id)?.startedAt ?? row.session.created_at ?? '';
  const ordered: T[] = [];
  const seen = new Set<string>();
  const visit = (row: T) => {
    if (seen.has(row.session.id)) return;
    seen.add(row.session.id);
    ordered.push(row);
    const kids = [...(children.get(row.session.id) ?? [])].sort((a, b) =>
      started(a).localeCompare(started(b)),
    );
    kids.forEach(visit);
  };
  (children.get(undefined) ?? []).forEach(visit);
  // A cycle in recorded parents leaves rows unreached; keep them, in export order.
  rows.forEach(visit);
  return ordered;
}

/** Whether the archive has a study to offer as a section. */
export function useArchiveSections(sessionId: string): { science: boolean } {
  const log = useScienceLog(sessionId);
  return { science: log.data?.in_study === true };
}

/**
 * A fork call presents the fork by name only; in an archive that carries the
 * fork's conversation, that name becomes a link to it, as a spawn's is.
 */
export function withForkSessionLink(tool: ToolInvocation): ToolInvocation {
  const output = tool.output;
  const child =
    tool.name === 'fork' && output && typeof output === 'object' && !Array.isArray(output)
      ? (output as Record<string, unknown>)['session_id']
      : undefined;
  const subject = tool.presentation?.subject;
  if (typeof child !== 'string' || !child || !subject || !tool.presentation) return tool;
  return {
    ...tool,
    presentation: {
      ...tool.presentation,
      blocks: tool.presentation.blocks.map((block) =>
        block.id === subject && block.type === 'text'
          ? { ...block, type: 'link', target: 'session', uri: child }
          : block,
      ),
    },
  };
}

/**
 * A question a tool asked while it ran (a fork's approval) records the tool's
 * name but not its call. Within one session, when exactly one call of that tool
 * was running when the question was asked, the question is shown under it.
 */
export function withAskingCall(
  interactions: PendingInteraction[],
  tools: readonly ToolInvocation[],
  sessionId: string,
): PendingInteraction[] {
  return interactions.map((interaction) => {
    const name = interaction.source.tool_name;
    if (interaction.source.invocation_id || !name || interaction.owner_session_id !== sessionId)
      return interaction;
    const asked = Date.parse(interaction.created_at);
    const running = tools.filter((tool) => {
      const started = Date.parse(tool.started_at ?? '');
      const ended = Date.parse(tool.completed_at ?? '');
      return (
        tool.name === name &&
        tool.session_id === sessionId &&
        started <= asked &&
        (Number.isNaN(ended) || asked <= ended)
      );
    });
    return running.length === 1
      ? { ...interaction, source: { ...interaction.source, invocation_id: running[0]!.id } }
      : interaction;
  });
}
