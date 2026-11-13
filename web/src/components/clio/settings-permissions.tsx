import type { PermissionPolicy } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { SETTINGS_COLUMN } from '@/lib/settings-fold';
import { useConnectionSettings } from '@/providers/connection-provider';
import { InfoTip } from './info-tip';
import { ItemList } from './primitives/item-row';
import { SaveBar } from './primitives/save-bar';
import { StateView } from './primitives/state-view';
import { AccessRuleDialog } from './settings-access-rule-dialog';
import {
  changeSummary,
  draftForPolicy,
  emptyDraft,
  policyFromDraft,
  priorityChoices,
  priorityRanks,
  type PolicyDraft,
} from './settings-access-rule-model';
import { AccessRuleRow } from './settings-access-rule-row';
import { GroupEmptyLine, GroupErrorLine } from './settings-permissions-lines';
import { rowArrowKeyDown } from '@/lib/row-arrow-keys';
import { PermissionRequests } from './settings-permissions-requests';
import { SettingsGroupLabel } from './settings-row';
import { SettingsSectionHeading } from './settings-section-heading';
import { t } from '@lingui/core/macro';

/** A rule in the working set; `origin` is its index in the saved set. */
interface StagedRule {
  id: string;
  policy: PermissionPolicy;
  origin?: number;
  changed?: boolean;
}

let nextRuleId = 0;

/**
 * Access rules (D rows, F dialog, H save bar). Adding, editing and removing
 * stage changes; the save bar replaces the complete set in one request, so an
 * invalid set leaves every saved rule unchanged.
 */
export function PermissionPoliciesPanel({ initialWorkspaceId }: { initialWorkspaceId?: string }) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const policiesKey = queryKeys.key('permission-policies', settings.endpoint);
  const policies = useQuery({
    queryKey: policiesKey,
    queryFn: ({ signal }) => repository.policies(signal),
  });
  const workspaces = useQuery({
    queryKey: queryKeys.key('workspaces', settings.endpoint),
    queryFn: ({ signal }) => repository.workspaces(signal),
  });
  const [staged, setStaged] = useState<StagedRule[] | null>(null);
  const [confirmingId, setConfirmingId] = useState<string>();
  const [editor, setEditor] = useState<{ open: boolean; editingId?: string }>({ open: false });
  const [draft, setDraft] = useState<PolicyDraft>(emptyDraft);
  const [saveError, setSaveError] = useState<string>();

  const saved = policies.data ?? [];
  const rules: StagedRule[] =
    staged ?? saved.map((policy, index) => ({ id: `saved-${index}`, policy, origin: index }));
  const added = rules.filter((rule) => rule.origin === undefined).length;
  const changed = rules.filter((rule) => rule.origin !== undefined && rule.changed).length;
  const removed = staged ? saved.length - (rules.length - added) : 0;
  const count = added + changed + removed;
  const ranks = priorityRanks(rules.map((rule) => rule.policy));
  const editorIndex = rules.findIndex((rule) => rule.id === editor.editingId);

  const stage = (next: StagedRule[]) => {
    setStaged(next);
    setSaveError(undefined);
  };
  const replace = useMutation({
    mutationFn: (next: PermissionPolicy[]) => repository.updatePolicies(next),
    onSuccess: (next) => {
      queryClient.setQueryData(policiesKey, next);
      setStaged(null);
      setSaveError(undefined);
      toast.success(t`Access rules saved`);
    },
    onError: () => setSaveError(t`The service did not accept these rules. Nothing changed.`),
  });

  const openEditor = (rule?: StagedRule, asCopy = false) => {
    setConfirmingId(undefined);
    setDraft(
      rule
        ? draftForPolicy(rule.policy)
        : { ...emptyDraft, scopeId: initialWorkspaceId ?? emptyDraft.scopeId },
    );
    setEditor({ open: true, editingId: rule && !asCopy ? rule.id : undefined });
  };
  const confirmEditor = () => {
    const policy = policyFromDraft(draft);
    stage(
      editor.editingId === undefined
        ? [...rules, { id: `new-${nextRuleId++}`, policy }]
        : rules.map((rule) =>
            rule.id === editor.editingId ? { ...rule, policy, changed: true } : rule,
          ),
    );
    setEditor({ open: false });
  };

  return (
    <section aria-labelledby="access-rules-heading">
      <SettingsGroupLabel
        addLabel={t`New access rule`}
        onAdd={policies.data ? () => openEditor() : undefined}
      >
        <span className="flex items-center gap-1.5" id="access-rules-heading">
          {t`Access rules`}
          <InfoTip label={t`About access rules`}>
            {t`Higher priority wins. A tie goes to the stricter rule. Rules save together: an invalid set leaves every saved rule unchanged.`}
          </InfoTip>
        </span>
      </SettingsGroupLabel>
      <ItemList label={t`Access rules`}>
        {rules.map((rule, index) => (
          <AccessRuleRow
            confirming={confirmingId === rule.id}
            dirty={rule.origin === undefined || Boolean(rule.changed)}
            key={rule.id}
            onAskRemove={() => setConfirmingId(rule.id)}
            onDuplicate={() => openEditor(rule, true)}
            onEdit={() => openEditor(rule)}
            onKeep={() => setConfirmingId(undefined)}
            onRemove={() => {
              setConfirmingId(undefined);
              stage(rules.filter((entry) => entry.id !== rule.id));
            }}
            policy={rule.policy}
            position={index + 1}
            rank={ranks[index]}
            workspaces={workspaces.data}
          />
        ))}
        {policies.isPending ? (
          <StateView kind="loading" size="row" title={t`Loading access rules…`} />
        ) : null}
        {policies.isSuccess && rules.length === 0 ? (
          <GroupEmptyLine>
            {t`No access rules. Protected actions follow the service defaults.`}
          </GroupEmptyLine>
        ) : null}
        {policies.isError && !staged ? (
          <GroupErrorLine onRetry={() => void policies.refetch()} retrying={policies.isFetching}>
            {t`Couldn’t load the access rules.`}
          </GroupErrorLine>
        ) : null}
      </ItemList>
      <SaveBar
        count={count}
        error={saveError}
        label={
          <>
            {changeSummary(added, changed, removed)}
            <span className="ml-3 text-muted-foreground">{t`rules save together`}</span>
          </>
        }
        onDiscard={() => {
          setStaged(null);
          setConfirmingId(undefined);
          setSaveError(undefined);
        }}
        onSave={() => replace.mutate(rules.map((rule) => rule.policy))}
        saving={replace.isPending}
      />
      <AccessRuleDialog
        draft={draft}
        editing={editor.editingId !== undefined}
        onConfirm={confirmEditor}
        onDraftChange={setDraft}
        onOpenChange={(open) => setEditor((current) => ({ ...current, open }))}
        open={editor.open}
        priorities={priorityChoices(
          rules.map((rule) => rule.policy),
          editorIndex === -1 ? undefined : editorIndex,
        )}
        workspaces={workspaces.data}
      />
    </section>
  );
}

export function PermissionsSettings({ workspaceId }: { workspaceId?: string }) {
  return (
    <div className="min-w-0">
      <SettingsSectionHeading
        info={t`Access rules decide which actions run, ask first or are blocked. The agent cannot approve its own protected actions.`}
        title={t`Permissions`}
      />
      {/* Both lists sit in the setting column (spec `.xrw`). */}
      <div className={SETTINGS_COLUMN} data-row-keys="" onKeyDown={rowArrowKeyDown}>
        <PermissionPoliciesPanel initialWorkspaceId={workspaceId} />
        <PermissionRequests />
      </div>
    </div>
  );
}
