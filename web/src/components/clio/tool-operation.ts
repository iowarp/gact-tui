import type { ToolInvocation, ToolPresentationBlock } from '@clio/core/v3';
import { asRecord } from './tool-result-shared';
import { formatDuration } from '@/lib/format';
import { getToolActionLabel } from './tool-presentation';
import { TOOL_OPERATIONS, type OperationDefinition } from './tool-operation-contract';
import {
  operationAnswer,
  operationInput,
  operationOutput,
  operationStrings,
  operationSubject,
  operationWaitTasks,
  type OperationContext,
  type OperationTask,
} from './tool-operation-data';
import { ph, plural, t as tx } from '@lingui/core/macro';

export interface ToolOperation {
  action: string;
  subjects: ToolPresentationBlock[];
  qualifier?: string;
  metadata?: string;
  expandable: boolean;
  kind: 'declared' | 'assignments' | 'results' | 'value' | 'message' | 'search' | 'matches';
  tasks?: OperationTask[];
  value?: unknown;
  scope?: ToolPresentationBlock;
  /** The exact query argument the row already shows (`for “…”`). */
  query?: string;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

const SINGULAR: Record<string, string> = {
  files: 'file',
  lines: 'line',
  matches: 'match',
  results: 'result',
  hits: 'hit',
  items: 'item',
  rows: 'row',
  tasks: 'task',
  entries: 'entry',
};

/** A producer's count recap as row metadata, reading "1 file matches" rather than "1 files match". */
function countSummary(summary: string): string {
  return summary.replace(
    /^1 (files|lines|matches|results|hits|items|rows|tasks|entries)\b( match\b)?/u,
    (_, noun: string, verb?: string) => `1 ${SINGULAR[noun]}${verb ? ' matches' : ''}`,
  );
}

/** A wait receipt's counts as row metadata: "2 returned, 1 running". */
function receiptMetadata(counts: {
  returned: number;
  running?: number;
  failed?: number;
  attention?: number;
  unavailable?: number;
}): string {
  const { returned, running, failed, attention, unavailable } = counts;
  return [
    plural(returned, { one: '# returned', other: '# returned' }),
    running ? plural(running, { one: '# running', other: '# running' }) : '',
    failed ? plural(failed, { one: '# unsuccessful', other: '# unsuccessful' }) : '',
    attention ? plural(attention, { one: '# needs attention', other: '# need attention' }) : '',
    unavailable ? plural(unavailable, { one: '# unavailable', other: '# unavailable' }) : '',
  ]
    .filter(Boolean)
    .join(', ');
}

function subjectFromInput(
  definition: OperationDefinition,
  input: Record<string, unknown>,
  context: OperationContext,
  declared?: ToolPresentationBlock,
): ToolPresentationBlock[] {
  if (
    declared &&
    !['Tasks', 'Subagent', 'Session'].includes(declared.label ?? '') &&
    declared.id !== 'wait-targets'
  )
    return [declared];
  for (const key of definition.subjects ?? []) {
    const values = operationStrings(input[key]);
    if (!values.length) continue;
    return values.map((value) =>
      definition.family === 'task' ||
      definition.family === 'wait' ||
      (['handle', 'tasks', 'target'].includes(key) && definition.family === 'ack')
        ? operationSubject(value, context, declared)
        : {
            id: `operation-${key}`,
            type: 'text' as const,
            text: value,
            label:
              key === 'command'
                ? value.split('\n')[0]!.slice(0, 160)
                : key === 'path'
                  ? value.split(/[\\/]/u).at(-1) || value
                  : value,
          },
    );
  }
  return declared && declared.id !== 'wait-targets' ? [declared] : [];
}

function assignments(
  tool: ToolInvocation,
  input: Record<string, unknown>,
  context: OperationContext,
): OperationTask[] {
  const output = asRecord(operationOutput(tool));
  const inputs = Array.isArray(input.spawns) ? input.spawns : [input];
  const outputs = Array.isArray(output?.tasks)
    ? output.tasks
    : Array.isArray(output?.results)
      ? output.results
      : [output];
  return inputs.flatMap((value, index) => {
    const args = asRecord(value);
    if (!args) return [];
    const receipt = asRecord(outputs[index]);
    const handle =
      text(receipt?.handle) ||
      text(receipt?.task_id) ||
      text(receipt?.session_id) ||
      `assignment-${index}`;
    const sessionId = text(receipt?.session_id);
    const block = tool.presentation?.blocks.find(
      (b) => b.target === 'session' && (!sessionId || b.uri === sessionId),
    );
    const child =
      context.subagents?.[handle] ??
      Object.values(context.subagents ?? {}).find((row) => row.child_session_id === sessionId);
    const model = asRecord(receipt?.model);
    const ran = asRecord(model?.ran);
    return [
      {
        key: handle,
        subject: operationSubject(handle, context, block, text(args.name) || child?.title),
        assignment: text(args.task) || text(receipt?.assignment),
        agent: text(args.agent) || child?.agent_id,
        model: text(ran?.model_id) || child?.model_choice?.ran.model_id || text(args.model),
        error: text(receipt?.error),
      },
    ];
  });
}

function declaredResults(tool: ToolInvocation, context: OperationContext): OperationTask[] {
  const blocks = tool.presentation?.blocks ?? [];
  return blocks
    .filter(
      (block) =>
        block.result_kind === 'completion' ||
        (block.severity === 'error' && block.id.startsWith('wait-')),
    )
    .map((block) => {
      const handle = block.uri || block.label?.split(': ')[0] || block.id;
      return {
        key: block.id,
        subject: operationSubject(
          handle,
          context,
          block,
          block.title !== handle ? block.title : undefined,
        ),
        model: block.model,
        status: block.status,
        blocks: [block],
      };
    });
}

/** Read complete native task records whose semantic fields are already individually declared. */
function declaredTaskMatches(tool: ToolInvocation, context: OperationContext): OperationTask[] {
  const blocks = tool.presentation?.blocks ?? [];
  return blocks
    .filter((block) => /^task-\d+-identity$/u.test(block.id) && block.target === 'session')
    .map((subject) => {
      const prefix = subject.id.slice(0, -'identity'.length);
      const assignment = blocks.find((block) => block.id === `${prefix}assignment`);
      let body = assignment?.text;
      if (
        body &&
        !assignment?.content_ref &&
        body.startsWith('Input:\n```json\n') &&
        body.endsWith('\n```')
      ) {
        try {
          const input = asRecord(JSON.parse(body.slice('Input:\n```json\n'.length, -4)) as unknown);
          body = text(input?.task) || text(input?.question);
        } catch {
          body = undefined;
        }
      }
      return {
        key: subject.id,
        subject: operationSubject(subject.uri || subject.id, context, subject),
        assignment: body,
        blocks: assignment?.content_ref ? [assignment] : undefined,
      };
    });
}

/**
 * A call that did not succeed and recorded no result (failed, stopped, interrupted or with an
 * unrecorded outcome): its error or outcome is what it returned, not a literal null.
 */
function endedWithoutOutput(tool: ToolInvocation, output: unknown): boolean {
  return output === null && tool.state !== 'succeeded';
}

/** A read-only semantic projection shared by transcript and Evidence. No fetches or cached indexes. */
export function toolOperation(tool: ToolInvocation, context: OperationContext = {}): ToolOperation {
  const definition = TOOL_OPERATIONS[tool.name];
  const input = operationInput(tool);
  const output = operationOutput(tool);
  const result = asRecord(output);
  const declared =
    tool.presentation?.blocks.find(
      (b) => b.id === tool.presentation?.subject && ['link', 'text'].includes(b.type),
    ) ?? tool.presentation?.blocks.find((b) => b.type === 'link' && b.target === 'session');
  const blocks = tool.presentation?.blocks.filter((b) => b.id !== declared?.id) ?? [];
  const meaningful = blocks.some(
    (b) =>
      b.content_ref ||
      b.text ||
      b.detail ||
      ['media', 'workspace_file', 'check', 'terminal', 'item', 'link'].includes(b.type),
  );
  const presentedAction = getToolActionLabel(tool);
  const operation: ToolOperation = {
    action: definition?.presentedAction
      ? presentedAction === tool.name
        ? definition.action
        : presentedAction
      : definition?.action || presentedAction,
    subjects: definition
      ? subjectFromInput(definition, input, context, declared)
      : declared
        ? [declared]
        : [],
    expandable: Boolean(
      meaningful || tool.error || (output !== undefined && !endedWithoutOutput(tool, output)),
    ),
    kind: 'declared',
  };
  if (
    !operation.subjects.length &&
    ['fs_read_file', 'fs_write_file', 'fs_edit_file'].includes(tool.name) &&
    text(result?.path)
  )
    operation.subjects = [{ id: 'result-path', type: 'text', label: String(result?.path) }];
  if (!definition) {
    const summary = tool.presentation?.summary?.trim();
    if (summary && /^(?:\d|No\b|Lines\b|Empty\b)/u.test(summary))
      operation.metadata = countSummary(summary);
    if (!meaningful && output !== undefined && !endedWithoutOutput(tool, output)) {
      operation.kind = 'value';
      operation.value = output;
    }
    return operation;
  }
  if (
    definition.instruction &&
    text(input[definition.instruction]) &&
    tool.state === 'succeeded' &&
    !tool.error &&
    !tool.presentation?.blocks.some((b) => b.severity === 'error') &&
    !blocks.some((b) => ['diff', 'markdown', 'code'].includes(b.type) || b.content_ref)
  ) {
    operation.kind = 'message';
    operation.value = input[definition.instruction];
    operation.expandable = true;
    if (!operation.subjects.length) {
      const first = String(input[definition.instruction])
        .split('\n')[0]!
        .replace(/^#+\s*/u, '')
        .split(/(?<=[.!?])\s/u)[0]!;
      operation.subjects = [
        {
          id: 'operation-instruction',
          type: 'text',
          label: first.length > 100 ? `${first.slice(0, 100)}…` : first,
        },
      ];
    }
  }
  // A background launch was accepted, not finished: the row says where it runs.
  if (input.background === true && tool.state === 'succeeded')
    operation.metadata = tx`in the background`;
  if (typeof input.interval_s === 'number' && input.interval_s > 0)
    operation.metadata = tx`every ${ph({ interval: formatDuration(input.interval_s * 1000) })}`;
  if (typeof input.delay_seconds === 'number' && input.delay_seconds > 0)
    operation.metadata = tx`in ${ph({ delay: formatDuration(input.delay_seconds * 1000) })}`;
  if (typeof input.run_at === 'string') {
    const date = new Date(input.run_at);
    if (!Number.isNaN(date.getTime())) {
      try {
        operation.metadata = new Intl.DateTimeFormat(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
          ...(typeof input.timezone === 'string' ? { timeZone: input.timezone } : {}),
        }).format(date);
      } catch {
        operation.metadata = input.run_at;
      }
    }
  }
  if (definition.query && text(input[definition.query])) {
    operation.query = String(input[definition.query]);
    const query = operation.query;
    operation.qualifier = tx`for “${query}”`;
  }
  if (definition.family === 'search') {
    const rows = result?.matches ?? result?.results ?? result?.tasks ?? result?.hits;
    const count =
      typeof result?.count === 'number'
        ? result.count
        : Array.isArray(rows)
          ? rows.length
          : undefined;
    if (count !== undefined)
      operation.metadata = plural(count, { one: '# match', other: '# matches' });
    const filters = [text(input.scope), text(input.status)].filter(Boolean);
    if (filters.length)
      operation.qualifier = [operation.qualifier, `(${filters.join(', ')})`]
        .filter(Boolean)
        .join(' ');
    // A producer that links each match itself (file hits that open at their line, with
    // numbered context) keeps its view; the shared search reader covers the rest.
    const linkedMatches = blocks.some((b) => b.type === 'link');
    if (Array.isArray(rows) && rows.length && declared?.target !== 'resource' && !linkedMatches) {
      operation.kind = 'search';
      operation.value = rows;
    }
    if (!rows) {
      const matches = declaredTaskMatches(tool, context);
      if (matches.length) {
        operation.kind = 'matches';
        operation.tasks = matches;
        operation.subjects = [];
        operation.metadata = plural(matches.length, { one: '# match', other: '# matches' });
      }
    }
  }
  // A spawn that waited for its batch (spawn_agents_parallel wait=true) returns a wait's
  // receipt: its children's reports are read as returned results, one tab each.
  const batchWait =
    definition.family === 'assignment' && input.wait === true
      ? operationWaitTasks(tool, context)
      : undefined;
  if (batchWait?.tasks.length) {
    operation.kind = 'results';
    operation.tasks = batchWait.tasks;
    operation.expandable = true;
    operation.subjects = [];
    operation.metadata = receiptMetadata({
      returned: batchWait.tasks.length - batchWait.unavailable,
      running: batchWait.running,
      failed: batchWait.failed,
    });
  } else if (definition.family === 'assignment') {
    const tasks = assignments(tool, input, context);
    operation.tasks = tasks;
    operation.kind = 'assignments';
    operation.expandable = tasks.some((t) => t.assignment || t.error) || Boolean(tool.error);
    if (tasks.length === 1) operation.subjects = [tasks[0].subject];
    else {
      operation.subjects = [];
      operation.metadata = plural(tasks.length, { one: '# assignment', other: '# assignments' });
    }
  }
  if (definition.family === 'wait') {
    if (input.timeout_s === 0) operation.action = tx`Check`;
    else if (tool.state === 'running' && tool.presentation?.summary?.startsWith('Waiting for '))
      operation.action = tool.presentation.summary;
    const receipt = operationWaitTasks(tool, context);
    const tasks = receipt?.tasks ?? declaredResults(tool, context);
    operation.kind = 'results';
    operation.tasks = tasks;
    operation.expandable = tasks.length > 0 || Boolean(tool.error);
    const requested = operationStrings(input.tasks);
    operation.subjects = requested.map(
      (handle) => tasks.find((t) => t.key === handle)?.subject ?? operationSubject(handle, context),
    );
    if (receipt)
      operation.metadata = receiptMetadata({
        returned: tasks.length - receipt.unavailable,
        running: receipt.running,
        failed: receipt.failed,
        attention: receipt.attention,
        unavailable: receipt.unavailable,
      });
    else if (tool.state === 'running') operation.metadata = tx`Waiting`;
  }
  if (definition.family === 'ack' && ['succeeded', 'completed'].includes(tool.state))
    operation.expandable = blocks.some((b) => b.severity === 'error') || Boolean(tool.error);
  if (tool.name === 'send_agent_message' && text(input.message)) {
    operation.kind = 'message';
    operation.value = input.message;
    operation.expandable = true;
  }
  if (tool.name === 'get_task_result') {
    if (result?.fragments_require_concatenation === true && typeof input.handle === 'string') {
      operation.kind = 'results';
      operation.tasks = [
        { key: input.handle, subject: operationSubject(input.handle, context), page: result },
      ];
      return operation;
    }
    if (result?.truncated === true) {
      operation.kind = 'message';
      operation.value = tx`The complete result was not retained with this call.`;
      operation.metadata = tx`Partial result`;
      return operation;
    }
    const answer = operationAnswer(output);
    if (
      answer !== undefined &&
      result?.truncated !== true &&
      !Object.hasOwn(asRecord(answer) ?? {}, 'preview')
    ) {
      operation.kind = 'value';
      operation.value = answer;
    }
  }
  if (definition.family === 'value') {
    operation.kind = 'value';
    operation.value = result?.models ?? output;
  }
  if (definition.family === 'memory') {
    const notice = asRecord(result?.memory);
    const fact = asRecord(result?.fact);
    const name = text(notice?.description) || text(result?.description);
    if (!operation.subjects.length && name)
      operation.subjects = [{ id: 'memory-subject', type: 'text', text: name, label: name }];
    const scope =
      text(notice?.scope) || text(fact?.scope) || text(result?.scope) || text(input.scope);
    if (scope)
      operation.scope = {
        id: 'operation-scope',
        type: 'link',
        target: 'memory',
        uri: `scope:${scope === 'account' ? 'user' : scope}`,
        label: scope === 'account' || scope === 'user' ? tx`Personal` : scope,
      };
  }
  // Counts and extents (a read range, an empty file) and refusals are row metadata; other recaps are not.
  if (
    !operation.metadata &&
    /^(?:\d|No\b|Lines\b|Empty\b|rejected:|unavailable:|denied:)/iu.test(
      tool.presentation?.summary?.trim() ?? '',
    )
  )
    operation.metadata = countSummary(tool.presentation?.summary?.trim() ?? '');
  if (
    !meaningful &&
    operation.kind === 'declared' &&
    definition.family !== 'memory' &&
    output !== undefined &&
    !endedWithoutOutput(tool, output) &&
    !(result?.accepted === true && result.status === 'running')
  ) {
    operation.kind = 'value';
    operation.value = output;
  }
  // Submission acknowledgements do not pretend that a background result already exists.
  if (!meaningful && result?.accepted === true && result.status === 'running')
    operation.expandable = false;
  return operation;
}
