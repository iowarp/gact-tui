import type { ToolCallers, ToolOutcome, ToolPermission, ToolSetting } from '@clio/core/v3';
import { SESSION_APPROVAL_OPTIONS } from './session-behavior-options';

/** The person's choice, or the plugin's default. */
export type PermissionChoice = ToolPermission | 'default';
export type CallersChoice = ToolCallers | 'default';

export const PERMISSION_TEXT: Record<ToolPermission, { label: string; detail: string }> = {
  allow: { label: 'Always allow', detail: 'The agent uses this tool without asking.' },
  ask: {
    label: 'Needs approval',
    detail: 'The agent asks you before each use, in every approval mode.',
  },
  deny: {
    label: 'Blocked',
    detail: 'The tool is hidden from the agent, and any call to it is refused.',
  },
};

export const CALLERS_TEXT: Record<ToolCallers, { label: string; detail: string }> = {
  direct: { label: 'Direct', detail: 'The agent calls it itself; its scripts cannot.' },
  code: {
    label: 'Code',
    detail: 'Only run_code scripts call it; its schema stays out of the prompt.',
  },
  both: { label: 'Both', detail: 'The agent and its scripts can call it.' },
};

export const OUTCOME_TEXT: Record<ToolOutcome, string> = {
  runs: 'Runs',
  asks: 'Asks you',
  blocked: 'Blocked',
  reviewed: 'AI reviewer decides',
  covered: "Covered by the script's approval",
  unavailable: 'Not available',
};

export function modeLabel(mode: string): string {
  return SESSION_APPROVAL_OPTIONS.find((option) => option.value === mode)?.label ?? mode;
}

/** What the plugin's default permission means, in words. */
export function pluginPermissionText(tool: ToolSetting): string {
  const value = tool.configured_permission || tool.plugin_permission;
  if (!value) return 'Approval mode decides';
  return PERMISSION_TEXT[value].label;
}

export function pluginDefaultSource(tool: ToolSetting): string {
  if (tool.configured_permission) return 'set by this deployment';
  return tool.plugin_permission_source === 'plugin' ? 'declared by the plugin' : 'from its flags';
}

export function pluginCallersText(tool: ToolSetting): string {
  if (!tool.plugin_callers_known) return 'known once an agent has loaded it';
  return CALLERS_TEXT[tool.plugin_callers].label;
}

export function permissionChoice(tool: ToolSetting): PermissionChoice {
  return tool.permission || 'default';
}

export function callersChoice(tool: ToolSetting): CallersChoice {
  return tool.configured_callers || 'default';
}

/** The tool's flags, in words. */
export function flagText(tool: ToolSetting): string {
  if (!tool.flags_known) return 'Read-only flag known once an agent has loaded it';
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
