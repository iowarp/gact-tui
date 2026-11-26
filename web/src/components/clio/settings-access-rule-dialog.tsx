import { workspaceName } from '@/lib/workspace-labels';
import type { Workspace } from '@clio/core/v3';
import { Select as SelectPrimitive } from 'radix-ui';
import {
  AppWindowIcon,
  FolderIcon,
  GlobeIcon,
  NotebookPenIcon,
  ShieldCheckIcon,
  ShieldIcon,
  WebhookIcon,
  WrenchIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem } from '@/components/ui/select';
import { capitalize, vocab } from '@/lib/brand-vocabulary';
import { cn } from '@/lib/utils';
import { SettingsSelectField } from './model-select-field';
import { DialogFrame } from './primitives/dialog-frame';
import { SegmentedControl } from './primitives/segmented-control';
import { SettingsRow } from './settings-row';
import {
  actionLabels,
  editableKinds,
  EVERY_WORKSPACE,
  hostPortError,
  kindLabels,
  subjectFor,
  type PolicyDraft,
  type PriorityChoice,
  type PolicyKind,
  type ShippedRule,
} from './settings-access-rule-model';
import { t, ph } from '@lingui/core/macro';

export function RuleKindIcon({ kind, className }: { kind: PolicyKind; className?: string }) {
  const Icon =
    kind === 'browser_certificate'
      ? ShieldCheckIcon
      : kind === 'browser_host'
        ? AppWindowIcon
        : kind === 'domain'
          ? GlobeIcon
          : kind === 'fs_root'
            ? FolderIcon
            : kind === 'plan_acl'
              ? NotebookPenIcon
              : kind === 'hook'
                ? WebhookIcon
                : WrenchIcon;
  return <Icon aria-hidden="true" className={className} />;
}

/** A Setting-row select: the select-shaped field (C) over a listbox. */
function RuleSelect({
  id,
  value,
  options,
  onChange,
  icon,
  disabled,
  initialFocus,
}: {
  id: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string; icon?: ReactNode; hint?: string }>;
  onChange: (value: string) => void;
  icon?: ReactNode;
  disabled?: boolean;
  initialFocus?: boolean;
}) {
  const current = options.find((option) => option.value === value);
  return (
    <Select disabled={disabled} onValueChange={onChange} value={value}>
      <SelectPrimitive.Trigger asChild>
        <SettingsSelectField
          data-initial-focus={initialFocus ? '' : undefined}
          icon={current?.icon ?? icon}
          id={id}
          title={current?.label}
          value={current?.label}
        />
      </SelectPrimitive.Trigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.icon}
            {option.label}
            {option.hint ? (
              <span className="ml-auto min-w-0 truncate pl-3 text-muted-foreground">
                {option.hint}
              </span>
            ) : null}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Radix Select reserves '' for no value, so leaving placement to the agent needs a token. */
const AFTER = 'after';

const fieldClass = 'h-[1.875rem] w-full min-w-0 text-menu placeholder:font-sans md:text-menu';

/**
 * New / Edit access rule (F): Setting rows in the dialog frame. Saving a rule
 * stages it with the rest of the set; the page's save bar sends them together.
 */
export function AccessRuleDialog({
  open,
  onOpenChange,
  editing,
  draft,
  onDraftChange,
  workspaces,
  priorities,
  shipped,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: boolean;
  draft: PolicyDraft;
  onDraftChange: (draft: PolicyDraft) => void;
  workspaces?: readonly Workspace[];
  /** Where the rule can rank, in the rows' terms (see `priorityChoices`). */
  priorities: readonly PriorityChoice[];
  /** The edited rule shipped with the agent (`shippedRule`). */
  shipped?: ShippedRule;
  onConfirm: () => void;
}) {
  const [touched, setTouched] = useState(false);
  const set = (patch: Partial<PolicyDraft>) => onDraftChange({ ...draft, ...patch });
  const subject = subjectFor(draft.kind);
  const subjectMissing = !draft.subject.trim();
  const portError = hostPortError(draft.kind, draft.subject);
  const subjectError = subjectMissing ? subject.error : portError;
  const domain = draft.kind === 'domain';
  const anyWorkspace = t`Any ${ph({ workspace: vocab.workspace })}`;
  const everyWorkspace = t`Every ${ph({ workspace: vocab.workspace })}`;
  const workspaceOptions = [
    // A domain rule needs a workspace or every workspace; elsewhere no workspace means any.
    ...(domain || draft.scopeId === EVERY_WORKSPACE
      ? [{ value: EVERY_WORKSPACE, label: everyWorkspace }]
      : []),
    ...(!domain || !draft.scopeId
      ? [
          {
            value: 'any',
            label: domain ? t`No ${ph({ workspace: vocab.workspace })} chosen` : anyWorkspace,
          },
        ]
      : []),
    ...(workspaces ?? []).map((workspace) => ({
      value: workspace.id,
      label: workspaceName(workspace),
    })),
  ];
  const scope = domain ? 'workspace' : draft.scope;
  const changeOpen = (next: boolean) => {
    if (!next) setTouched(false);
    onOpenChange(next);
  };
  return (
    <DialogFrame
      confirm={{
        label: t`Save rule`,
        onConfirm: () => {
          setTouched(false);
          onConfirm();
        },
        disabled: Boolean(subjectError),
      }}
      icon={<ShieldIcon className="size-4" />}
      onOpenChange={changeOpen}
      open={open}
      title={editing ? t`Edit access rule` : t`New access rule`}
    >
      <div className="-mt-1 grid">
        <SettingsRow htmlFor="access-rule-kind" title={t`Applies to`}>
          <RuleSelect
            id="access-rule-kind"
            initialFocus
            onChange={(value) =>
              set({
                kind: value as PolicyKind,
                scope: value === 'domain' ? 'workspace' : draft.scope,
                scopeId:
                  value === 'domain' && (draft.scope === 'session' || !draft.scopeId)
                    ? EVERY_WORKSPACE
                    : draft.scopeId,
              })
            }
            options={editableKinds.map((kind) => ({
              value: kind,
              label: kindLabels[kind],
              icon: <RuleKindIcon kind={kind} />,
            }))}
            value={draft.kind}
          />
        </SettingsRow>
        <SettingsRow htmlFor="access-rule-decision" title={t`Decision`}>
          <RuleSelect
            id="access-rule-decision"
            onChange={(action) => set({ action })}
            options={Object.entries(actionLabels).map(([value, label]) => ({ value, label }))}
            value={draft.action}
          />
        </SettingsRow>
        <SettingsRow
          info={
            domain
              ? t`Use * as a wildcard. Add :port to match one port, like github.com:22 or [::1]:8080; without a port, every port matches.`
              : t`Patterns use the service's exact matching rules.`
          }
          error={(touched && subjectMissing) || portError ? subjectError : undefined}
          note={
            shipped ? (
              <>
                {t`Shipped with ${ph({ agent: vocab.agent })}`}
                {shipped.protocol ? <span className="ml-2.5">{shipped.protocol}</span> : null}
                {shipped.reason ? <span className="block">{shipped.reason}</span> : null}
              </>
            ) : undefined
          }
          htmlFor="access-rule-subject"
          title={subject.label}
        >
          <Input
            aria-invalid={(touched && subjectMissing) || portError ? true : undefined}
            className={cn(fieldClass, 'font-mono')}
            id="access-rule-subject"
            onBlur={() => setTouched(true)}
            onChange={(event) => set({ subject: event.target.value })}
            placeholder={subject.placeholder}
            title={draft.subject || undefined}
            value={draft.subject}
          />
        </SettingsRow>
        {draft.kind !== 'domain' && draft.kind !== 'fs_root' ? (
          <SettingsRow htmlFor="access-rule-path" title={t`Limit to file paths`}>
            <Input
              className={cn(fieldClass, 'font-mono')}
              id="access-rule-path"
              onChange={(event) => set({ pathPattern: event.target.value })}
              placeholder={t`Optional`}
              title={draft.pathPattern || undefined}
              value={draft.pathPattern}
            />
          </SettingsRow>
        ) : null}
        {draft.kind === 'plan_acl' || draft.modes ? (
          <SettingsRow htmlFor="access-rule-modes" title={t`Modes`}>
            <Input
              className={fieldClass}
              id="access-rule-modes"
              onChange={(event) => set({ modes: event.target.value })}
              // i18n-ignore: example mode identifiers the service matches
              placeholder="plan, architect"
              value={draft.modes}
            />
          </SettingsRow>
        ) : null}
        {draft.kind === 'hook' || draft.events ? (
          <SettingsRow htmlFor="access-rule-events" title={t`Tool events`}>
            <Input
              className={fieldClass}
              id="access-rule-events"
              onChange={(event) => set({ events: event.target.value })}
              placeholder="PreToolUse"
              value={draft.events}
            />
          </SettingsRow>
        ) : null}
        <SettingsRow
          info={
            domain ? t`Domain rules apply per ${ph({ workspace: vocab.workspace })}.` : undefined
          }
          title={t`Scope`}
        >
          <SegmentedControl
            label={t`Scope`}
            onValueChange={(value) => set({ scope: value, scopeId: '' })}
            options={[
              { value: 'workspace', label: capitalize(vocab.workspace) },
              { value: 'session', label: t`Session`, disabled: domain },
            ]}
            value={scope}
          />
        </SettingsRow>
        {scope === 'workspace' ? (
          <SettingsRow
            note={
              domain && !draft.scopeId
                ? t`Choose a ${ph({ workspace: vocab.workspace })}, or every ${ph({ workspace: vocab.workspace })}, for this rule to take effect.`
                : undefined
            }
            htmlFor="access-rule-workspace"
            title={capitalize(vocab.workspace)}
          >
            <RuleSelect
              icon={<FolderIcon />}
              id="access-rule-workspace"
              onChange={(value) => set({ scopeId: value === 'any' ? '' : value })}
              options={workspaceOptions}
              value={draft.scopeId || 'any'}
            />
          </SettingsRow>
        ) : (
          <SettingsRow htmlFor="access-rule-session" title={t`Session ID`}>
            <Input
              className={cn(fieldClass, 'font-mono')}
              id="access-rule-session"
              onChange={(event) => set({ scopeId: event.target.value })}
              placeholder={t`Any session`}
              value={draft.scopeId}
            />
          </SettingsRow>
        )}
        <SettingsRow
          info={t`Higher priority wins. A tie goes to the stricter rule.`}
          htmlFor="access-rule-priority"
          title={t`Priority`}
        >
          <RuleSelect
            id="access-rule-priority"
            onChange={(priority) => set({ priority: priority === AFTER ? '' : priority })}
            options={priorities.map((choice) => ({ ...choice, value: choice.value || AFTER }))}
            value={draft.priority || AFTER}
          />
        </SettingsRow>
      </div>
    </DialogFrame>
  );
}
