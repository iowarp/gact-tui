import { workspaceName } from '@/lib/workspace-labels';
import type { PermissionPolicy, Workspace } from '@clio/core/v3';
import type { StatusTone } from './primitives/status-indicator';
import { vocab } from '@/lib/brand-vocabulary';

export type PolicyKind = NonNullable<PermissionPolicy['kind']>;

export interface PolicyDraft {
  kind: PolicyKind;
  scope: 'session' | 'workspace';
  scopeId: string;
  action: string;
  subject: string;
  pathPattern: string;
  priority: string;
  modes: string;
  events: string;
}

export const emptyDraft: PolicyDraft = {
  kind: 'tool',
  scope: 'workspace',
  scopeId: '',
  action: 'ask',
  subject: '',
  pathPattern: '',
  priority: '',
  modes: '',
  events: '',
};

/** Decisions as offered in the dialog. */
export const actionLabels: Record<string, string> = {
  ask: 'Ask every time',
  allow: 'Allow',
  allow_session: 'Allow for session',
  allow_workspace: `Allow for ${vocab.workspace}`,
  deny: 'Block',
};

/** Decisions as a rule's status word. */
const actionStatus: Record<string, { label: string; tone: StatusTone }> = {
  ask: { label: 'Ask every time', tone: 'warning' },
  allow: { label: 'Allowed', tone: 'success' },
  allow_session: { label: 'Allowed for session', tone: 'success' },
  allow_workspace: { label: `Allowed for ${vocab.workspace}`, tone: 'success' },
  deny: { label: 'Blocked', tone: 'error' },
};

export function ruleStatus(action: string): { label: string; tone: StatusTone } {
  return actionStatus[action] ?? { label: action, tone: 'info' };
}

export const kindLabels: Record<PolicyKind, string> = {
  tool: 'Tool action',
  domain: 'Internet domain',
  fs_root: 'File location',
  plan_acl: 'Planning mode action',
  hook: 'Tool lifecycle event',
  browser_host: 'Website in the shared browser',
  browser_certificate: 'Trusted certificate',
};

/** Rules the person makes from the shared browser itself: they can be removed, not edited. */
export const BROWSER_KINDS: ReadonlySet<PolicyKind> = new Set([
  'browser_host',
  'browser_certificate',
]);

export const editableKinds = (Object.keys(kindLabels) as PolicyKind[]).filter(
  (kind) => !BROWSER_KINDS.has(kind),
);

/** Shared by every rule row so status words and actions line up. */
export const RULE_COLUMNS = { statusWidth: 158, actionsWidth: 96 } as const;

export function inferredKind(policy: PermissionPolicy): PolicyKind {
  if (policy.kind) return policy.kind;
  if (policy.host_pattern) return 'domain';
  return 'tool';
}

/** What the rule matches, as the row's mono title. */
export function ruleTarget(policy: PermissionPolicy): string {
  const kind = inferredKind(policy);
  if (kind === 'domain' || kind === 'browser_host' || kind === 'browser_certificate') {
    return policy.host_pattern || '*';
  }
  if (kind === 'fs_root') return policy.path_pattern || '*';
  return policy.tool_name_pattern || '*';
}

export interface RuleScope {
  label: string;
  /** The identifier of a workspace this connection no longer knows. */
  missingId?: string;
}

export function ruleScope(policy: PermissionPolicy, workspaces?: readonly Workspace[]): RuleScope {
  if (policy.scope === 'session') {
    return { label: policy.scope_id ? 'One conversation' : 'Any conversation' };
  }
  if (!policy.scope_id) return { label: `Any ${policy.scope || vocab.workspace}` };
  const workspace = workspaces?.find((entry) => entry.id === policy.scope_id);
  return workspace
    ? { label: workspaceName(workspace) }
    : { label: `Unregistered ${vocab.workspace}`, missingId: policy.scope_id };
}

function isWildcard(value?: string): boolean {
  return !value || value === '*' || value === '**';
}

/** Facts after the kind on the meta line: modes, events, path limit, certificate key. */
export function ruleDetails(policy: PermissionPolicy): string[] {
  const kind = inferredKind(policy);
  const details: string[] = [];
  if (policy.modes?.length) details.push(policy.modes.join(', '));
  if (policy.on?.length) details.push(policy.on.join(', '));
  if (
    (kind === 'tool' || kind === 'plan_acl' || kind === 'hook') &&
    !isWildcard(policy.path_pattern)
  ) {
    details.push(`in ${policy.path_pattern}`);
  }
  if (kind === 'browser_certificate' && policy.fingerprint) {
    details.push(`key sha256/${policy.fingerprint}`);
  }
  return details;
}

export function draftForPolicy(policy: PermissionPolicy): PolicyDraft {
  const kind = inferredKind(policy);
  return {
    kind,
    scope: policy.scope === 'session' ? 'session' : 'workspace',
    scopeId: policy.scope_id ?? '',
    action: policy.action,
    subject:
      kind === 'domain'
        ? (policy.host_pattern ?? '')
        : kind === 'fs_root'
          ? (policy.path_pattern ?? '')
          : (policy.tool_name_pattern ?? '*'),
    pathPattern:
      kind === 'tool' || kind === 'plan_acl' || kind === 'hook' ? (policy.path_pattern ?? '') : '',
    priority: policy.priority === undefined ? '' : String(policy.priority),
    modes: (policy.modes ?? []).join(', '),
    events: (policy.on ?? []).join(', '),
  };
}

function splitList(value: string): string[] | undefined {
  const values = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return values.length ? values : undefined;
}

export function policyFromDraft(draft: PolicyDraft): PermissionPolicy {
  const policy: PermissionPolicy = {
    kind: draft.kind,
    scope: draft.kind === 'domain' ? 'workspace' : draft.scope,
    scope_id: draft.scopeId || undefined,
    action: draft.action,
    priority: draft.priority ? Number.parseInt(draft.priority, 10) : undefined,
    modes: splitList(draft.modes),
    on: splitList(draft.events),
    metadata: {},
  };
  if (draft.kind === 'domain') policy.host_pattern = draft.subject.trim();
  else if (draft.kind === 'fs_root') policy.path_pattern = draft.subject.trim();
  else {
    policy.tool_name_pattern = draft.subject.trim();
    policy.path_pattern = draft.pathPattern.trim() || undefined;
  }
  return policy;
}

export const subjectField: Record<
  'tool' | 'domain' | 'fs_root',
  { label: string; placeholder: string; error: string }
> = {
  tool: {
    label: 'Tool name',
    placeholder: 'Tool name or pattern',
    error: 'Enter a tool name or pattern.',
  },
  domain: {
    label: 'Domain',
    placeholder: 'Domain or pattern, like *.earthscope.org',
    error: 'Enter a domain or pattern.',
  },
  fs_root: {
    label: 'File location',
    placeholder: 'Path or pattern, like D:/science/**',
    error: 'Enter a path or pattern.',
  },
};

export function subjectFor(kind: PolicyKind) {
  return kind === 'domain' || kind === 'fs_root' ? subjectField[kind] : subjectField.tool;
}

export function priorityError(priority: string): string | undefined {
  return priority !== '' && !/^-?\d+$/.test(priority.trim()) ? 'Use a whole number.' : undefined;
}

/**
 * Each rule's rank among the rules' priorities, counted from the lowest (1), so
 * "Priority N" stays small and positive while higher still wins. The agent
 * places approved grants below every existing rule (0, -1, -2…). Ties share a
 * rank; a rule without a priority has none.
 */
export function priorityRanks(policies: readonly { priority?: number }[]) {
  const levels = [...new Set(policies.flatMap((policy) => policy.priority ?? []))].sort(
    (left, right) => left - right,
  );
  return policies.map((policy) =>
    policy.priority === undefined ? undefined : levels.indexOf(policy.priority) + 1,
  );
}

export interface PriorityChoice {
  /** The raw priority the agent stores; '' leaves placement to the agent. */
  value: string;
  label: string;
  hint?: string;
}

/**
 * The editor's Priority choices in the rows' rank terms, so no raw number shows:
 * tie with a rank's rules, or go above or below all of them. A rule without a
 * priority (a new one) may stay "After existing rules", as the agent places it.
 * `editing` is the edited rule's index in `policies`.
 */
export function priorityChoices(
  policies: readonly PermissionPolicy[],
  editing: number | undefined,
): PriorityChoice[] {
  const levels = [...new Set(policies.flatMap((policy) => policy.priority ?? []))].sort(
    (left, right) => left - right,
  );
  const own = editing === undefined ? undefined : policies[editing]?.priority;
  const alone = (level: number | undefined) =>
    own !== undefined &&
    own === level &&
    policies.every((policy, index) => index === editing || policy.priority !== level);
  const lowest = levels[0];
  const highest = levels.at(-1);
  const choices: PriorityChoice[] = [];
  if (own === undefined) {
    choices.push({ value: '', label: 'After existing rules', hint: 'The agent places it' });
  } else if (lowest !== undefined && !alone(lowest)) {
    choices.push({ value: String(lowest - 1), label: 'Below every rule' });
  }
  levels.forEach((level, index) => {
    const others = policies.filter((policy, at) => at !== editing && policy.priority === level);
    const names = others.map(ruleTarget);
    choices.push({
      value: String(level),
      label: `Priority ${index + 1}`,
      hint: names.length
        ? names.length > 2
          ? `Same as ${names.slice(0, 2).join(', ')} +${names.length - 2}`
          : `Same as ${names.join(', ')}`
        : 'This rule',
    });
  });
  if (!alone(highest)) {
    choices.push({ value: String((highest ?? 0) + 1), label: 'Above every rule' });
  }
  return choices;
}

/** "1 rule added, 2 rules removed" */
export function changeSummary(added: number, changed: number, removed: number): string {
  const rules = (count: number) => `${count} ${count === 1 ? 'rule' : 'rules'}`;
  return [
    added ? `${rules(added)} added` : '',
    changed ? `${rules(changed)} changed` : '',
    removed ? `${rules(removed)} removed` : '',
  ]
    .filter(Boolean)
    .join(', ');
}
