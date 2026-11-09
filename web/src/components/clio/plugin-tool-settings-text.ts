import type {
  ToolCallers,
  ToolOutcome,
  ToolPermission,
  ToolRule,
  ToolSetting,
} from '@clio/core/v3';
import type { StatusTone } from './primitives/status-indicator';
import { SESSION_APPROVAL_OPTIONS } from './session-behavior-options';

/** The person's choice, or the plugin's default. */
export type PermissionChoice = ToolPermission | 'default';
export type CallersChoice = ToolCallers | 'default';

export const PERMISSION_TEXT: Record<ToolPermission, { label: string; detail: string }> = {
  allow: { label: 'Always allow', detail: 'Uses it without asking.' },
  ask: { label: 'Needs approval', detail: 'Asks before each use, in every mode.' },
  deny: { label: 'Blocked', detail: 'Hidden from the agent. Calls are refused.' },
};

export const CALLERS_TEXT: Record<ToolCallers, { label: string; detail: string }> = {
  direct: { label: 'Direct', detail: "The agent calls it. Its scripts can't." },
  code: { label: 'Code', detail: 'Only run_code scripts. Its schema stays out of the prompt.' },
  both: { label: 'Both', detail: 'The agent and its scripts.' },
};

/** What a call does, in the one or two words a table cell holds. */
export const OUTCOME_TEXT: Record<ToolOutcome, string> = {
  runs: 'Runs',
  asks: 'Asks you',
  blocked: 'Blocked',
  reviewed: 'AI reviews',
  covered: 'Covered',
  unavailable: 'Not available',
};

/** The same outcome as a sentence, for its hover name. */
export const OUTCOME_TITLE: Record<ToolOutcome, string> = {
  runs: 'Runs without asking',
  asks: 'Asks you before each call',
  blocked: 'Blocked: hidden from the agent',
  reviewed: 'An AI reviewer approves each call or asks you',
  covered: "Covered by the script's approval",
  unavailable: 'Not available: its I/O leaves this caller out',
};

export const OUTCOME_TONE: Record<ToolOutcome, StatusTone> = {
  runs: 'success',
  asks: 'warning',
  blocked: 'error',
  reviewed: 'info',
  covered: 'info',
  unavailable: 'idle',
};

/** A call from a run_code script, when the script column folds into the row. */
export const SCRIPT_OUTCOME_TEXT: Record<ToolOutcome, string> = {
  runs: 'Script runs',
  asks: 'Script asks you',
  blocked: 'Script blocked',
  reviewed: 'Script: AI reviews',
  covered: 'Script covered',
  unavailable: "Scripts can't call it",
};

export function modeLabel(mode: string): string {
  return SESSION_APPROVAL_OPTIONS.find((option) => option.value === mode)?.label ?? mode;
}

export function permissionChoice(tool: ToolSetting): PermissionChoice {
  return tool.permission || 'default';
}

export function callersChoice(tool: ToolSetting): CallersChoice {
  return tool.configured_callers || 'default';
}

/** The tool's flags, in words. */
export function flagText(tool: ToolSetting): string {
  if (!tool.flags_known) return 'Not loaded yet';
  if (tool.read_only) return 'Read-only';
  return tool.destructive ? 'Destructive' : 'Writes or acts';
}

/** What the approval mode does with a group when no rule is set. */
export function groupModeText(group: 'read' | 'write', mode: string, covering: string[]): string {
  if (group === 'read') {
    return 'Without a rule, read-only tools run without asking in every approval mode.';
  }
  const script = covering.includes(mode)
    ? "In a run_code script, the script's approval covers its calls."
    : mode === 'ask'
      ? 'In a run_code script, each call asks you, one at a time.'
      : '';
  const base: Record<string, string> = {
    ask: 'Without a rule, each write or command asks you.',
    'auto-edits': 'Without a rule, file edits run and other writes ask you.',
    'ai-review': 'Without a rule, an AI reviewer approves each write or asks you.',
    'spotter-ai': 'Without a rule, writes ask you while a SPOTTER agent watches.',
    bypass: 'Without a rule, writes run without asking. Blocked tools stay blocked.',
  };
  return [base[mode] ?? 'Without a rule, the approval mode decides.', script]
    .filter(Boolean)
    .join(' ');
}

export function ruleText(action: string, where: string, path: string): string {
  const verb =
    action === 'deny'
      ? 'Blocked'
      : action === 'ask'
        ? 'Needs approval'
        : action.startsWith('allow')
          ? 'Allowed'
          : action;
  const place =
    where === 'everywhere'
      ? 'everywhere'
      : where === 'session'
        ? 'in one conversation'
        : 'in one workspace';
  return `${verb} ${place}${path ? ` for ${path}` : ''}`;
}

/** Rules saved from approvals; a rule for everywhere without a path is the permission itself. */
export function savedRules(tool: ToolSetting): ToolRule[] {
  return tool.rules.filter((rule) => rule.where !== 'everywhere' || rule.path_pattern);
}

/** Where the tool's values come from, in a few words. */
export function sourceText(tool: ToolSetting): string {
  if (tool.permission === 'deny') return 'Blocked by you';
  if (tool.permission === 'allow') return 'Allowed by you';
  if (tool.permission === 'ask') return 'Needs approval, set by you';
  const rule = savedRules(tool)[0];
  if (rule) {
    const text = ruleText(rule.action, rule.where, rule.path_pattern);
    return `Rule: ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  }
  if (effectiveCallers(tool).value === 'code')
    return 'Code only: its schema stays out of the prompt';
  if (tool.configured_permission) return 'Set by this deployment';
  return tool.plugin_permission_source === 'plugin'
    ? 'Defaults from the plugin'
    : 'Defaults from its flags';
}

/** The permission a tool has now in ``mode``, and whether it comes from a default. */
export function effectivePermission(
  tool: ToolSetting,
  mode: string,
): { value: ToolPermission; isDefault: boolean } {
  if (tool.permission) return { value: tool.permission, isDefault: false };
  const declared =
    tool.configured_permission ||
    (tool.plugin_permission_source === 'plugin' ? tool.plugin_permission : '');
  if (declared) return { value: declared, isDefault: true };
  // Nothing declared: what the tool's flags and the approval mode do with a call.
  const outcome = tool.outcomes[mode];
  const result = outcome?.direct === 'unavailable' ? outcome.script : outcome?.direct;
  const value: ToolPermission =
    result === 'blocked' ? 'deny' : result === 'asks' || result === 'reviewed' ? 'ask' : 'allow';
  return { value, isDefault: true };
}

/** The I/O a tool has now, and whether it comes from a default. */
export function effectiveCallers(tool: ToolSetting): {
  value: ToolCallers | '';
  isDefault: boolean;
} {
  if (tool.configured_callers) return { value: tool.configured_callers, isDefault: false };
  return { value: tool.plugin_callers_known ? tool.plugin_callers : '', isDefault: true };
}

/** The value a tool falls back to when the person's choice is cleared. */
export function defaultPermission(tool: ToolSetting, mode: string): ToolPermission {
  return effectivePermission({ ...tool, permission: '' }, mode).value;
}

export function defaultCallers(tool: ToolSetting): ToolCallers | '' {
  return effectiveCallers({ ...tool, configured_callers: '' }).value;
}
