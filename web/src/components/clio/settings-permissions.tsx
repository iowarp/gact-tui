import type { PermissionPolicy } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FolderKeyIcon,
  Globe2Icon,
  LoaderCircleIcon,
  PencilIcon,
  PlusIcon,
  ShieldCheckIcon,
  Trash2Icon,
  WrenchIcon,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/reui/frame';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ClioStatus } from './status';

type PolicyKind = NonNullable<PermissionPolicy['kind']>;

interface PolicyDraft {
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

const emptyDraft: PolicyDraft = {
  kind: 'tool',
  scope: 'workspace',
  scopeId: '',
  action: 'ask',
  subject: '*',
  pathPattern: '',
  priority: '',
  modes: '',
  events: '',
};

const actionLabels: Record<string, string> = {
  allow: 'Allow',
  allow_session: 'Allow for session',
  allow_workspace: 'Allow for workspace',
  ask: 'Ask every time',
  deny: 'Block',
};

const kindLabels: Record<PolicyKind, string> = {
  tool: 'Tool action',
  domain: 'Internet domain',
  fs_root: 'File location',
  plan_acl: 'Planning mode action',
  hook: 'Tool lifecycle event',
};

function inferredKind(policy: PermissionPolicy): PolicyKind {
  if (policy.kind) return policy.kind;
  if (policy.host_pattern) return 'domain';
  return 'tool';
}

function draftForPolicy(policy: PermissionPolicy): PolicyDraft {
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

function policyFromDraft(draft: PolicyDraft): PermissionPolicy {
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
  if (draft.kind === 'domain') policy.host_pattern = draft.subject;
  else if (draft.kind === 'fs_root') policy.path_pattern = draft.subject;
  else {
    policy.tool_name_pattern = draft.subject;
    policy.path_pattern = draft.pathPattern || undefined;
  }
  return policy;
}

function PolicyIcon({ kind }: { kind: PolicyKind }) {
  const Icon = kind === 'domain' ? Globe2Icon : kind === 'fs_root' ? FolderKeyIcon : WrenchIcon;
  return <Icon aria-hidden="true" className="mt-0.5 size-4 text-primary" />;
}

function isWildcardPattern(value?: string): boolean {
  return !value || value === '*' || value === '**';
}

function policySummary(policy: PermissionPolicy): string {
  const kind = inferredKind(policy);
  if (kind === 'domain') {
    return isWildcardPattern(policy.host_pattern)
      ? 'All internet domains'
      : `Domain pattern ${policy.host_pattern}`;
  }
  if (kind === 'fs_root') {
    return isWildcardPattern(policy.path_pattern)
      ? 'All permitted file locations'
      : `File location ${policy.path_pattern}`;
  }

  const allTools = isWildcardPattern(policy.tool_name_pattern);
  const allPaths = isWildcardPattern(policy.path_pattern);
  const subject = allTools ? 'All tool actions' : `Tool pattern ${policy.tool_name_pattern}`;
  return allPaths ? `${subject} in all permitted locations` : `${subject} limited to ${policy.path_pattern}`;
}

export function PermissionPoliciesPanel({
  initialWorkspaceId,
}: {
  initialWorkspaceId?: string;
}) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number>();
  const [draft, setDraft] = useState<PolicyDraft>(emptyDraft);
  const [removeIndex, setRemoveIndex] = useState<number>();
  const policies = useQuery({
    queryKey: ['permission-policies', settings.endpoint],
    queryFn: ({ signal }) => repository.policies(signal),
  });
  const workspaces = useQuery({
    queryKey: ['workspaces', settings.endpoint, 'permission-settings'],
    queryFn: ({ signal }) => repository.workspaces(signal),
  });
  const replace = useMutation({
    mutationFn: (next: PermissionPolicy[]) => repository.updatePolicies(next),
    onSuccess: (next) => {
      queryClient.setQueryData(['permission-policies', settings.endpoint], next);
      setEditorOpen(false);
      setRemoveIndex(undefined);
      toast.success('Access rules saved');
    },
    onError: (error) =>
      toast.error('Access rules were not changed', { description: error.message }),
  });
  const openEditor = (policy?: PermissionPolicy, index?: number) => {
    setEditingIndex(index);
    setDraft(
      policy
        ? draftForPolicy(policy)
        : { ...emptyDraft, scopeId: initialWorkspaceId ?? emptyDraft.scopeId },
    );
    setEditorOpen(true);
  };
  const save = () => {
    const row = policyFromDraft(draft);
    const current = policies.data ?? [];
    const next =
      editingIndex === undefined
        ? [...current, row]
        : current.map((policy, index) => (index === editingIndex ? row : policy));
    replace.mutate(next);
  };
  const remove = () => {
    if (removeIndex === undefined) return;
    replace.mutate((policies.data ?? []).filter((_policy, index) => index !== removeIndex));
  };
  const set = (field: keyof PolicyDraft, value: string) =>
    setDraft((current) => ({ ...current, [field]: value }));
  const selectedWorkspace = workspaces.data?.find((workspace) => workspace.id === draft.scopeId);
  const subjectLabel =
    draft.kind === 'domain'
      ? 'Domain pattern'
      : draft.kind === 'fs_root'
        ? 'File location pattern'
        : 'Tool name pattern';
  const saveDisabled =
    !draft.subject ||
    replace.isPending ||
    (draft.priority !== '' && !/^-?\d+$/.test(draft.priority));

  return (
    <Frame spacing="lg">
      <FrameHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <FrameTitle>Access rules</FrameTitle>
            <FrameDescription>
              Persistent protection rules evaluated before tools, file access, and network
              connections.
            </FrameDescription>
          </div>
          <Button onClick={() => openEditor()}>
            <PlusIcon /> New rule
          </Button>
        </div>
      </FrameHeader>
      <Alert>
        <ShieldCheckIcon aria-hidden="true" />
        <AlertTitle>Precedence is explicit</AlertTitle>
        <AlertDescription>
          Higher priority wins. At the same priority, the more restrictive decision wins. Saving
          replaces the complete rule set atomically; invalid rules leave every existing rule
          unchanged.
        </AlertDescription>
      </Alert>
      <FramePanel className="grid gap-2 p-2">
        {policies.data?.map((policy, index) => {
          const kind = inferredKind(policy);
          const scopeName = policy.scope_id
            ? workspaces.data?.find((workspace) => workspace.id === policy.scope_id)
                ?.display_name || policy.scope_id
            : `Any ${policy.scope}`;
          return (
            <div
              className="flex items-center gap-2 rounded-lg border border-transparent px-3 py-2 transition-colors hover:border-border hover:bg-accent/40"
              key={`${policy.scope}:${policy.scope_id}:${policy.priority}:${index}`}
            >
              <PolicyIcon kind={kind} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{actionLabels[policy.action] ?? policy.action}</p>
                  <ClioStatus
                    label={
                      policy.action === 'deny'
                        ? 'Blocked'
                        : policy.action === 'ask'
                          ? 'Confirmation required'
                          : 'Allowed'
                    }
                    value={
                      policy.action === 'deny'
                        ? 'failed'
                        : policy.action === 'ask'
                          ? 'degraded'
                          : 'healthy'
                    }
                  />
                  <Badge variant="outline">{kindLabels[kind]}</Badge>
                  <Badge variant="outline">{scopeName}</Badge>
                  {policy.priority !== undefined ? (
                    <Badge variant="outline">Priority {policy.priority}</Badge>
                  ) : null}
                </div>
                <p className="mt-1 break-all text-xs text-muted-foreground">
                  {policySummary(policy)}
                </p>
                {policy.modes?.length ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Modes: {policy.modes.join(', ')}
                  </p>
                ) : null}
                {policy.on?.length ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Events: {policy.on.join(', ')}
                  </p>
                ) : null}
              </div>
              <Button
                aria-label={`Edit rule ${index + 1}`}
                onClick={() => openEditor(policy, index)}
                size="icon-sm"
                variant="ghost"
              >
                <PencilIcon />
              </Button>
              <Button
                aria-label={`Remove rule ${index + 1}`}
                onClick={() => setRemoveIndex(index)}
                size="icon-sm"
                variant="ghost"
              >
                <Trash2Icon />
              </Button>
            </div>
          );
        })}
        {!policies.isPending && !policies.data?.length ? (
          <p className="p-5 text-sm text-muted-foreground">
            No persistent access rules. Protected actions follow the service defaults and ask when
            required.
          </p>
        ) : null}
        {policies.error ? (
          <Alert variant="destructive">
            <AlertTitle>Access rules unavailable</AlertTitle>
            <AlertDescription>{policies.error.message}</AlertDescription>
          </Alert>
        ) : null}
      </FramePanel>

      <Dialog onOpenChange={setEditorOpen} open={editorOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingIndex === undefined ? 'Create access rule' : 'Edit access rule'}
            </DialogTitle>
            <DialogDescription>
              The connected service validates the complete rule set before applying any change.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Applies to</FieldLabel>
                <Select
                  onValueChange={(value: PolicyKind) =>
                    setDraft((current) => ({
                      ...current,
                      kind: value,
                      scope: value === 'domain' ? 'workspace' : current.scope,
                    }))
                  }
                  value={draft.kind}
                >
                  <SelectTrigger aria-label="Rule kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(kindLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Decision</FieldLabel>
                <Select onValueChange={(value) => set('action', value)} value={draft.action}>
                  <SelectTrigger aria-label="Rule decision">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(actionLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="policy-subject">{subjectLabel}</FieldLabel>
              <Input
                id="policy-subject"
                onChange={(event) => set('subject', event.target.value)}
                placeholder={
                  draft.kind === 'domain'
                    ? '*.earthscope.org'
                    : draft.kind === 'fs_root'
                      ? 'D:/science/**'
                      : 'fs_*'
                }
                value={draft.subject}
              />
              <FieldDescription>
                Patterns use the service’s exact matching rules; identifiers remain visible because
                they define the security boundary.
              </FieldDescription>
            </Field>
            {draft.kind !== 'domain' && draft.kind !== 'fs_root' ? (
              <Field>
                <FieldLabel htmlFor="policy-path">Limit to file paths</FieldLabel>
                <Input
                  id="policy-path"
                  onChange={(event) => set('pathPattern', event.target.value)}
                  placeholder="Optional"
                  value={draft.pathPattern}
                />
              </Field>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Scope</FieldLabel>
                <Select
                  disabled={draft.kind === 'domain'}
                  onValueChange={(value: 'session' | 'workspace') =>
                    setDraft((current) => ({ ...current, scope: value, scopeId: '' }))
                  }
                  value={draft.kind === 'domain' ? 'workspace' : draft.scope}
                >
                  <SelectTrigger aria-label="Rule scope">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="workspace">Workspace</SelectItem>
                    <SelectItem value="session">Session</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>
                  {draft.scope === 'workspace' || draft.kind === 'domain'
                    ? 'Workspace'
                    : 'Session ID'}
                </FieldLabel>
                {draft.scope === 'workspace' || draft.kind === 'domain' ? (
                  <Select
                    onValueChange={(value) => set('scopeId', value === 'any' ? '' : value)}
                    value={draft.scopeId || 'any'}
                  >
                    <SelectTrigger aria-label="Rule workspace">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any workspace</SelectItem>
                      {workspaces.data?.map((workspace) => (
                        <SelectItem key={workspace.id} value={workspace.id}>
                          {workspace.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    aria-label="Rule session ID"
                    onChange={(event) => set('scopeId', event.target.value)}
                    placeholder="Any session"
                    value={draft.scopeId}
                  />
                )}
                {!draft.scopeId ? (
                  <FieldDescription>
                    A blank identity applies to any{' '}
                    {draft.kind === 'domain'
                      ? 'workspace, but domain rules require a specific workspace to take effect'
                      : draft.scope}
                    .
                  </FieldDescription>
                ) : null}
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="policy-priority">Priority</FieldLabel>
              <Input
                id="policy-priority"
                inputMode="numeric"
                onChange={(event) => set('priority', event.target.value)}
                placeholder="Assigned after existing rules"
                value={draft.priority}
              />
              <FieldDescription>
                Higher values win. Leave blank to append this rule at the lowest priority.
              </FieldDescription>
            </Field>
            {draft.kind === 'plan_acl' || draft.modes ? (
              <Field>
                <FieldLabel htmlFor="policy-modes">Modes</FieldLabel>
                <Input
                  id="policy-modes"
                  onChange={(event) => set('modes', event.target.value)}
                  placeholder="plan, architect"
                  value={draft.modes}
                />
              </Field>
            ) : null}
            {draft.kind === 'hook' || draft.events ? (
              <Field>
                <FieldLabel htmlFor="policy-events">Tool events</FieldLabel>
                <Input
                  id="policy-events"
                  onChange={(event) => set('events', event.target.value)}
                  placeholder="PreToolUse"
                  value={draft.events}
                />
              </Field>
            ) : null}
            {selectedWorkspace ? (
              <p className="text-xs text-muted-foreground">
                This rule is scoped to {selectedWorkspace.display_name}.
              </p>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <Button disabled={saveDisabled} onClick={save}>
              {replace.isPending ? <LoaderCircleIcon className="animate-spin" /> : null}
              Save rule set
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        onOpenChange={(open) => !open && setRemoveIndex(undefined)}
        open={removeIndex !== undefined}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this access rule?</AlertDialogTitle>
            <AlertDialogDescription>
              Future matching actions will fall through to the next rule or the service default.
              Existing transcript and audit evidence is not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep rule</AlertDialogCancel>
            <AlertDialogAction onClick={remove} variant="destructive">
              Remove rule
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Frame>
  );
}
