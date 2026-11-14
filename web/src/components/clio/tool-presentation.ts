import { flowToolDescriptor } from './flow-tool-presentation';
import { toolResultRecord } from './tool-result-shared';
import type { ToolInvocation, ToolPresentationBlock } from '@clio/core/v3';
import { formatDuration } from '@/lib/format';
import type { ClioStatusValue } from './status';
import { questionToolSummary } from './question-tool-presentation';
import { taskWaitInterruptionDetail } from './task-wait-presentation';
import { TOOL_OPERATIONS } from './tool-operation-contract';
import { t, ph } from '@lingui/core/macro';

export interface ToolPresentation {
  title: string;
  kind: 'analysis-view' | 'tool';
}

/** Labels and summaries are authored by the provider's presentation contract. */
export function getToolPresentation(tool: ToolInvocation): ToolPresentation {
  return {
    title: getToolActionLabel(tool),
    kind: 'tool',
  };
}

export function isA2uiCatalogLookup(tool: ToolInvocation): boolean {
  if (tool.name !== 'load_skill') return false;
  const input = toolInput(tool);
  if (typeof input?.skill_id === 'string' && input.skill_id.startsWith('a2ui-catalog-'))
    return true;
  const subject = tool.presentation?.blocks.find(
    (block) => block.id === tool.presentation?.subject,
  );
  return (subject?.label || subject?.text || '').startsWith('a2ui-catalog-');
}

function toolInput(tool: ToolInvocation): Record<string, unknown> | undefined {
  const input =
    tool.input !== null && typeof tool.input === 'object' && !Array.isArray(tool.input)
      ? (tool.input as Record<string, unknown>)
      : undefined;
  const kwargs = input?.kwargs;
  return kwargs !== null && typeof kwargs === 'object' && !Array.isArray(kwargs)
    ? (kwargs as Record<string, unknown>)
    : input;
}

const TASK_OPERATIONS: Record<string, string> = {
  run_flow: t`Start flow`,
  run_workflow: t`Start workflow`,
  spawn_agent_task: t`Delegate`,
  observe_tasks: t`Check task status`,
  task_result: t`Read task result`,
  get_task_result: t`Read task result`,
  query_tasks: t`Find tasks`,
  restart_agent: t`Restart agent`,
  pause_agent: t`Pause agent`,
  resume_agent: t`Resume agent`,
  list_tasks: t`List tasks`,
  cancel_tasks: t`Cancel tasks`,
};

/** Keep protocol identifiers in details and use the same operation label everywhere. */
export function getToolActionLabel(tool: ToolInvocation): string {
  if (tool.name === 'ask_user')
    return tool.presentation?.action === 'Answered' ? t`Answered` : t`Ask you`;
  if (TASK_OPERATIONS[tool.name]) return TASK_OPERATIONS[tool.name]!;
  if (isA2uiCatalogLookup(tool)) return t`Inspect widget catalog`;
  let action = tool.presentation?.action || tool.title || tool.name;
  const title = tool.title?.trim();
  // A family presenter must not replace a named operation (Restart agent,
  // Observe tasks, Run flow...) with an unrelated bare verb. For matching
  // verbs, a declared subject can supply the object without repeating it.
  if (title && /^\S+$/u.test(action.trim()) && /\s/u.test(title)) {
    const titleVerb = title.split(/\s/u, 1)[0].toLocaleLowerCase();
    const subject = getToolSubject(tool);
    if (action.toLocaleLowerCase() !== titleVerb || !(subject?.label || subject?.text))
      action = title;
  }
  if (tool.name === 'prepare_execution_runtime' && action === 'Prepare execution runtime')
    return t`Get execution environment`;
  if (
    [
      'create_a2ui_surface',
      'update_a2ui_components',
      'update_a2ui_data_model',
      'delete_a2ui_surface',
      'inspect_a2ui_surface',
    ].includes(tool.name)
  ) {
    const legacy: Record<string, string> = {
      'Generate UI element': t`Generate widget`,
      'Update UI element': t`Update widget`,
      'Delete UI element': t`Delete widget`,
      'Inspect UI element': t`Inspect widget`,
    };
    return legacy[action] ?? action;
  }
  return action;
}

/** The call a nested call came from, by name: "Run script: Inspect cover". */
export function callerName(parent: ToolInvocation): string {
  const subject = getToolSubject(parent);
  const target = subject?.label || subject?.text;
  return target ? `${getToolActionLabel(parent)}: ${target}` : getToolActionLabel(parent);
}

/** Name the requested catalog section while preserving exact arguments in details. */
export function getToolSubject(tool: ToolInvocation): ToolPresentationBlock | undefined {
  if (tool.name === 'ask_user') return undefined;
  const declared = tool.presentation?.blocks.find(
    (block) =>
      block.id === tool.presentation?.subject && (block.type === 'link' || block.type === 'text'),
  );
  // Legacy task receipts omitted subject while returning one conversation.
  // Attachment links, such as saved terminal output, remain result content
  // unless the producer explicitly declares them as the operation's subject.
  const identities =
    tool.presentation?.blocks.filter(
      (block) => block.type === 'link' && block.target === 'session',
    ) ?? [];
  let subject = declared ?? (identities.length === 1 ? identities[0] : undefined);
  if (subject && /^(Subagent|Session|Tasks)$/iu.test(subject.label ?? '')) {
    const flow = flowToolDescriptor(tool);
    const assignedName = tool.name === 'spawn_agent_task' ? toolInput(tool)?.name : undefined;
    const label = flow?.label || (typeof assignedName === 'string' ? assignedName.trim() : '');
    if (label) subject = { ...subject, label };
  }
  if (!isA2uiCatalogLookup(tool)) return subject;
  const input = toolInput(tool);
  const paths = [input?.file, ...(Array.isArray(input?.files) ? input.files : [])].filter(
    (path): path is string => typeof path === 'string' && Boolean(path),
  );
  const names = paths.map((path) => {
    const component = path.split('#/components/')[1];
    return component ? component.replaceAll('~1', '/').replaceAll('~0', '~') : t`General`;
  });
  const label = [...new Set(names)].join(', ') || t`General`;
  return { id: subject?.id ?? 'catalog-section', type: 'text', text: label, label };
}

export function getToolSummary(tool: ToolInvocation): string | undefined {
  if (tool.name === 'ask_user') return questionToolSummary(tool);
  const captured = toolResultRecord(tool.output);
  if (['run_flow', 'run_workflow'].includes(tool.name) && captured?.accepted === true)
    return t`Request accepted`;
  if (tool.name === 'restart_agent' && captured?.restart_requested === true)
    return t`Restart requested`;
  const summary = tool.presentation?.summary?.trim();
  if (!summary) return undefined;
  const normalize = (value: string) =>
    value
      .trim()
      .replace(/[.:]+$/u, '')
      .toLocaleLowerCase();
  const label = normalize(summary);
  // Retained task-family receipts used their category as the outcome. A
  // structured task identity/result supplies the useful facts instead.
  if (
    label === 'tasks' &&
    (tool.presentation?.action === 'Inspect' ||
      tool.presentation?.blocks.some((block) => block.id.startsWith('task-')))
  )
    return undefined;
  const action = normalize(getToolActionLabel(tool));
  const subject = getToolSubject(tool);
  if (
    label === action ||
    label === normalize(subject?.label || subject?.text || '') ||
    action.endsWith(` ${label}`)
  )
    return undefined;
  return summary;
}

/** A result entity owns its name once; field headings and recorded bodies stay distinct. */
export function getToolResultBlocks(
  tool: ToolInvocation,
  subjectId?: string,
): ToolPresentationBlock[] {
  const subject = getToolSubject(tool);
  let entityLabel = subjectId === subject?.id ? subject?.label || subject?.text : undefined;
  return (tool.presentation?.blocks ?? [])
    .filter((block) => block.id !== subjectId)
    .flatMap((block) => {
      if (
        block.type === 'link' &&
        ['session', 'file', 'artifact', 'resource', 'work', 'surface'].includes(block.target ?? '')
      ) {
        entityLabel = block.label || block.text;
        return block;
      }
      // Plain metadata can restate the identity as a label/value pair (for
      // example, "Dataset: climate"). It adds no field beyond that identity.
      if (
        entityLabel &&
        block.type === 'text' &&
        block.label &&
        block.text &&
        !block.content_ref &&
        !block.severity &&
        !block.status &&
        !block.detail &&
        !block.result_kind &&
        `${block.label.trim()}: ${block.text.trim()}` === entityLabel.trim()
      )
        return [];
      return block.label && entityLabel && block.label.trim() === entityLabel.trim()
        ? { ...block, label: undefined }
        : block;
    });
}

/** Move compact file facts into the shared trailing header cluster. */
export function getToolHeaderMetadata(tool: ToolInvocation): string | undefined {
  const subject = getToolSubject(tool);
  const summary = tool.presentation?.summary?.trim() ?? '';
  if (tool.name === 'workspace_resource_search') {
    const input =
      tool.input !== null && typeof tool.input === 'object' && !Array.isArray(tool.input)
        ? (tool.input as Record<string, unknown>)
        : undefined;
    const query = typeof input?.query === 'string' ? input.query.trim() : '';
    if (query) return t`for “${query}”`;
  }
  return subject?.target === 'file' && /^\d[\d,]*\s+bytes?$/iu.test(summary) ? summary : undefined;
}

const DECLARED_TOOL_STATUSES = new Set<ClioStatusValue>([
  'interrupted',
  'succeeded',
  'failed',
  'degraded',
  'cancelled',
  'denied',
]);

/** Semantic outcome declared by the tool result, with transport state as fallback. */
export function getToolStatus(tool: ToolInvocation): ClioStatusValue {
  // Saved presentation metadata cannot establish an unrecorded completion.
  if (tool.state === 'unknown') return 'unknown';
  if (getToolInterruptionDetail(tool)) return 'interrupted';
  // A call the person stopped was stopped, whatever its producer called the error it saw.
  if (tool.state === 'cancelled') return 'cancelled';
  const declared = tool.presentation?.status;
  const status =
    declared && DECLARED_TOOL_STATUSES.has(declared as ClioStatusValue)
      ? (declared as ClioStatusValue)
      : tool.state;
  return status === 'failed' && stoppedDiagnostic(tool) ? 'cancelled' : status;
}

// The service records a call the person stopped as failed; its diagnostic says it was cancelled.
const STOPPED_DIAGNOSTIC =
  /^cancell?ed$|\bwas cancell?ed before approval\b|\bcancell?ed by (?:the )?(?:user|client|person)\b|\bturn cancell?ed\b/iu;

function stoppedDiagnostic(tool: ToolInvocation): boolean {
  return [
    tool.error,
    ...(tool.presentation?.blocks ?? [])
      .filter((block) => block.severity === 'error')
      .map((block) => block.text),
  ].some((text) => Boolean(text?.trim() && STOPPED_DIAGNOSTIC.test(text.trim())));
}

const STOPPED_TEXT = t`Stopped before it finished; no result was returned.`;
// The service's wording when the turn ended before a call's result was recorded.
const UNRECORDED_OUTCOME = /^execution outcome unavailable\b/iu;
const UNRECORDED_TEXT = t`Stopped before its result was recorded. Check any captured output before running it again.`;
// The service's execution-status block for a stopped task (its id may carry a result prefix),
// and its generic wording.
const EXECUTION_STATUS_BLOCK = 'task-execution-status';
const GENERIC_STOPPED = /^(?:execution )?cancell?ed\.?$/iu;

/**
 * Every stopped call reads the same: one Stopped outcome in place of the raw cancellation
 * error, the service's execution status, or its unrecorded-outcome notice. A specific
 * reason the service recorded is kept as that outcome's text.
 */
export function withStoppedOutcome(tool: ToolInvocation): ToolInvocation {
  if (getToolStatus(tool) !== 'cancelled') return tool;
  const blocks = tool.presentation?.blocks ?? [];
  if (blocks.some((block) => block.id === 'execution-outcome')) return tool;
  const cancellation = (text?: string) =>
    Boolean(text?.trim() && STOPPED_DIAGNOSTIC.test(text.trim()));
  const replaced = (block: ToolPresentationBlock) =>
    (block.severity === 'error' && cancellation(block.text)) ||
    (block.id.endsWith(EXECUTION_STATUS_BLOCK) && block.severity !== 'error');
  const status = blocks
    .find((block) => block.id.endsWith(EXECUTION_STATUS_BLOCK) && block.severity !== 'error')
    ?.text?.trim();
  const unrecorded = Boolean(tool.error?.trim() && UNRECORDED_OUTCOME.test(tool.error.trim()));
  const text = unrecorded
    ? UNRECORDED_TEXT
    : status && !GENERIC_STOPPED.test(status) && !cancellation(status)
      ? status
      : STOPPED_TEXT;
  // Another declared outcome already says how this call ended.
  const kept = blocks.filter((block) => !replaced(block));
  if (kept.some((block) => block.severity && block.text?.trim())) return tool;
  return {
    ...tool,
    presentation: {
      ...tool.presentation,
      summary: tool.presentation?.summary ?? '',
      status: 'cancelled',
      blocks: [
        ...kept,
        { id: 'execution-outcome', type: 'text', label: t`Stopped`, severity: 'warning', text },
      ],
    },
  };
}

/** The call ended because it was stopped or interrupted, not because it failed. */
export function isToolStopped(tool: ToolInvocation): boolean {
  const status = getToolStatus(tool);
  return status === 'interrupted' || status === 'cancelled';
}

/** Explain an interruption only from authored metadata or a recognized receipt. */
export function getToolInterruptionDetail(tool: ToolInvocation): string | undefined {
  const declared = tool.presentation?.status === 'interrupted';
  if (declared && tool.presentation?.diagnostic?.trim()) return tool.presentation.diagnostic.trim();
  const receipt = taskWaitInterruptionDetail(tool);
  if (receipt) return receipt;
  return declared ? t`Interrupted` : undefined;
}

/** Explain an unsuccessful outcome using recorded diagnostics, never payload-status guesses. */
export function getToolFailureDetail(tool: ToolInvocation): string | undefined {
  const detail = failureDetail(tool);
  // A refusal is not a failure: its row already says Denied and who decided, so a
  // detail that only restates that is not repeated in the opened body.
  if (
    detail &&
    getToolStatus(tool) === 'denied' &&
    /^(?:permission\s+)?denied(?:\s+by\s+(?:you|the\s+user|user))?\.?$/iu.test(detail)
  )
    return undefined;
  return detail;
}

function failureDetail(tool: ToolInvocation): string | undefined {
  if (getToolStatus(tool) === 'unknown') {
    return (
      tool.error?.trim() ||
      t`No completion was recorded. Inspect the captured output before running this action again.`
    );
  }
  if (!['failed', 'denied', 'cancelled', 'degraded'].includes(getToolStatus(tool)))
    return undefined;
  const blocks = tool.presentation?.blocks ?? [];
  const errors = blocks
    .filter((block) => block.severity === 'error')
    .map((block) => block.text?.trim() || block.detail?.trim() || block.label?.trim())
    .filter((text): text is string => Boolean(text));
  if (errors.length) return [...new Set(errors)].join('\n');
  if (tool.error?.trim()) return tool.error.trim();
  if (tool.presentation?.diagnostic?.trim()) return tool.presentation.diagnostic.trim();
  const terminal = blocks.find((block) => block.type === 'terminal');
  if (terminal?.timed_out)
    return [t`Process timed out.`, terminal.text?.trim()].filter(Boolean).join('\n');
  if (terminal?.text?.trim()) return terminal.text.trim();
  if (terminal?.exit_code !== undefined && terminal.exit_code !== null)
    return t`Process exited with code ${ph({ exit_code: terminal.exit_code })}. No diagnostic output was recorded.`;
  if (getToolStatus(tool) === 'denied') return tool.presentation?.summary?.trim() || undefined;
  return tool.presentation?.summary?.trim() || t`No failure diagnostic was recorded.`;
}

/** Compact operation label with the same qualifying subject used by the transcript row. */
export function getToolActivityTitle(tool: ToolInvocation): string {
  const action = getToolActionLabel(tool);
  const subject = getToolSubject(tool);
  let label = subject?.label?.trim();
  // A path subject names its last segment; the full path stays in the call's details.
  if (
    label &&
    (TOOL_OPERATIONS[tool.name]?.subjects?.includes('path') ||
      /^(?:[A-Za-z]:[\\/]|[\\/]|~[\\/])/u.test(label))
  )
    label = label.split(/[\\/]/u).filter(Boolean).at(-1) ?? label;
  return label ? `${action} (${label})` : action;
}

/** A humane operation name for a call known only by its tool identifier. */
export function toolOperationLabel(name: string): string {
  if (TASK_OPERATIONS[name]) return TASK_OPERATIONS[name]!;
  const operation = TOOL_OPERATIONS[name];
  if (!operation) return name;
  if (operation.family === 'wait') return t`Wait for tasks`;
  // "Read result of" or "Run on" need their subject; alone they read as declared.
  return operation.standalone ?? operation.action;
}

/** An undeclared tool keeps its actual identifier as the fallback label. */
export function humanizeToolName(name: string): string {
  return name;
}

export function formatToolDuration(durationMs: number): string {
  return formatDuration(durationMs);
}
