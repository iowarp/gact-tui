import { workspaceName } from '@/lib/workspace-labels';
import type { PermissionPolicy, Workspace } from '@clio/core/v3';
import type { StatusTone } from './primitives/status-indicator';
import { vocab } from '@/lib/brand-vocabulary';
import { plural, t, ph } from '@lingui/core/macro';

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
  ask: t`Ask every time`,
  allow: t`Allow`,
  allow_session: t`Allow for session`,
  allow_workspace: t`Allow for ${ph({ workspace: vocab.workspace })}`,
  deny: t`Block`,
};

/** Decisions as a rule's status word. */
const actionStatus: Record<string, { label: string; tone: StatusTone }> = {
  ask: { label: t`Ask every time`, tone: 'warning' },
  allow: { label: t`Allowed`, tone: 'success' },
  allow_session: { label: t`Allowed for session`, tone: 'success' },
  allow_workspace: { label: t`Allowed for ${ph({ workspace: vocab.workspace })}`, tone: 'success' },
  deny: { label: t`Blocked`, tone: 'error' },
};

export function ruleStatus(action: string): { label: string; tone: StatusTone } {
  return actionStatus[action] ?? { label: action, tone: 'info' };
}

export const kindLabels: Record<PolicyKind, string> = {
  tool: t`Tool action`,
  domain: t`Internet domain`,
  fs_root: t`File location`,
  plan_acl: t`Planning mode action`,
  hook: t`Tool lifecycle event`,
  browser_host: t`Website in the shared browser`,
  browser_certificate: t`Trusted certificate`,
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
    return { label: policy.scope_id ? t`One conversation` : t`Any conversation` };
  }
  if (!policy.scope_id) return { label: t`Any ${ph({ scope: policy.scope || vocab.workspace })}` };
  const workspace = workspaces?.find((entry) => entry.id === policy.scope_id);
  return workspace
    ? { label: workspaceName(workspace) }
    : { label: t`Unregistered ${ph({ workspace: vocab.workspace })}`, missingId: policy.scope_id };
}

function isWildcard(value?: string): boolean {
  return !value || value === '*' || value === '**';
}

/** One fact on a rule's meta line; a `long` one (a path or key) goes last. */
export interface RuleDetail {
  text: string;
  long: boolean;
}

/** Facts after the kind on the meta line: modes, events, path limit, certificate key. */
export function ruleDetails(policy: PermissionPolicy): RuleDetail[] {
  const kind = inferredKind(policy);
  const details: RuleDetail[] = [];
  if (policy.modes?.length) details.push({ text: policy.modes.join(', '), long: false });
  if (policy.on?.length) details.push({ text: policy.on.join(', '), long: false });
  if (
    (kind === 'tool' || kind === 'plan_acl' || kind === 'hook') &&
    !isWildcard(policy.path_pattern)
  ) {
    details.push({ text: t`in ${ph({ path: policy.path_pattern ?? '' })}`, long: true });
  }
  if (kind === 'browser_certificate' && policy.fingerprint) {
    details.push({
      text: t`key sha256/${ph({ fingerprint: policy.fingerprint })}`,
      long: true,
    });
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
    label: t`Tool name`,
    placeholder: t`Tool name or pattern`,
    error: t`Enter a tool name or pattern.`,
  },
  domain: {
    label: t`Domain`,
    placeholder: t`Domain or pattern, like *.earthscope.org`,
    error: t`Enter a domain or pattern.`,
  },
  fs_root: {
    label: t`File location`,
    placeholder: t`Path or pattern, like D:/science/**`,
    error: t`Enter a path or pattern.`,
  },
};

export function subjectFor(kind: PolicyKind) {
  return kind === 'domain' || kind === 'fs_root' ? subjectField[kind] : subjectField.tool;
}

export function priorityError(priority: string): string | undefined {
  return priority !== '' && !/^-?\d+$/.test(priority.trim()) ? t`Use a whole number.` : undefined;
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
    choices.push({ value: '', label: t`After existing rules`, hint: t`The agent places it` });
  } else if (lowest !== undefined && !alone(lowest)) {
    choices.push({ value: String(lowest - 1), label: t`Below every rule` });
  }
  levels.forEach((level, index) => {
    const others = policies.filter((policy, at) => at !== editing && policy.priority === level);
    const names = others.map(ruleTarget);
    choices.push({
      value: String(level),
      label: t`Priority ${ph({ priority: index + 1 })}`,
      hint: names.length
        ? names.length > 2
          ? t`Same as ${ph({ names: names.slice(0, 2).join(', ') })} +${ph({ more: names.length - 2 })}`
          : t`Same as ${ph({ names: names.join(', ') })}`
        : t`This rule`,
    });
  });
  if (!alone(highest)) {
    choices.push({ value: String((highest ?? 0) + 1), label: t`Above every rule` });
  }
  return choices;
}

/** "1 rule added, 2 rules removed" */
export function changeSummary(added: number, changed: number, removed: number): string {
  return [
    added ? plural(added, { one: '# rule added', other: '# rules added' }) : '',
    changed ? plural(changed, { one: '# rule changed', other: '# rules changed' }) : '',
    removed ? plural(removed, { one: '# rule removed', other: '# rules removed' }) : '',
  ]
    .filter(Boolean)
    .join(', ');
}
