import { queryKeys } from '@/lib/query-keys';
import type { AgentEntry, SessionDefaults, Workspace } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { ChevronDownIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRepository } from '@/hooks/use-repository';
import { useSpotterAvailability } from '@/hooks/use-spotter-availability';
import { capitalize, vocab } from '@/lib/brand-vocabulary';
import { DeleteIcon, EditIcon } from '@/lib/icon-vocabulary';
import { useConnectionSettings } from '@/providers/connection-provider';
import { approvalOptionViews, unavailableApprovalNotice } from './approval-option-availability';
import { ClioPathPicker } from './path-picker';
import { DialogFrame } from './primitives/dialog-frame';
import { SegmentedControl } from './primitives/segmented-control';
import {
  SESSION_APPROVAL_OPTIONS,
  SESSION_MODE_OPTIONS,
  SESSION_MODE_PATCHES,
} from './session-behavior-options';
import { SettingsRow } from './settings-row';

const SELECT_FIELD =
  'w-full min-w-0 px-[9px] text-[0.78125rem] data-[size=default]:h-[1.875rem] data-[size=default]:rounded-md';

export type ResourceTarget = {
  kind: 'workspace' | 'session';
  id: string;
  label: string;
};

export interface ResourceActions {
  createWorkspace: (input: { name: string; rootPath: string }) => Promise<void>;
  createSession: (input: {
    title: string;
    workspaceId: string;
    /** The agent the session runs (`<marketplace>/<id>`); omitted uses the default. */
    agentRef?: string;
    mode: 'plan' | 'edit' | 'architect';
    routingMode: 'auto' | 'chat' | 'experts' | 'reasoning_only';
    approvalMode: 'ask' | 'auto-edits' | 'bypass' | 'ai-review' | 'spotter-ai';
  }) => Promise<void>;
  renameWorkspace: (workspaceId: string, name: string) => Promise<void>;
  updateWorkspace: (
    workspaceId: string,
    input: { name: string; root_path: string },
  ) => Promise<void>;
  grantWorkspaceFolder: (workspaceId: string, path: string) => Promise<void>;
  revokeWorkspaceFolder: (workspaceId: string, path: string) => Promise<void>;
  workspaceMemory?: (workspaceId: string) => Promise<{ use_account_memory: boolean }>;
  setWorkspaceMemory?: (workspaceId: string, useAccountMemory: boolean) => Promise<void>;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  setWorkspacePinned: (workspaceId: string, pinned: boolean) => Promise<void>;
  setSessionPinned: (sessionId: string, pinned: boolean) => Promise<void>;
  archiveSession: (sessionId: string) => Promise<void>;
  restoreSession: (sessionId: string) => Promise<void>;
  deleteWorkspace: (workspaceId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  exportSession: (
    sessionId: string,
    mode: import('@clio/core/v3').SessionExportMode,
  ) => Promise<{ download_path: string; filename: string }>;
  importSession: (value: unknown) => Promise<void>;
}

interface ClioResourceDialogsProps {
  actions: ResourceActions;
  activeWorkspaceId: string;
  agents: readonly AgentEntry[];
  createKind: 'workspace' | 'session' | null;
  deleteTarget: ResourceTarget | null;
  onCreateKindChange: (kind: 'workspace' | 'session' | null) => void;
  onDeleteTargetChange: (target: ResourceTarget | null) => void;
  onRenameTargetChange: (target: ResourceTarget | null) => void;
  renameTarget: ResourceTarget | null;
  workspaces: readonly Workspace[];
}

export function ClioResourceDialogs(props: ClioResourceDialogsProps) {
  return (
    <>
      {props.createKind ? (
        <CreateResourceDialog
          actions={props.actions}
          activeWorkspaceId={props.activeWorkspaceId}
          agents={props.agents}
          createKind={props.createKind}
          onCreateKindChange={props.onCreateKindChange}
          workspaces={props.workspaces}
        />
      ) : null}
      {props.renameTarget ? (
        <RenameResourceDialog
          actions={props.actions}
          key={`${props.renameTarget.kind}:${props.renameTarget.id}`}
          onClose={() => props.onRenameTargetChange(null)}
          target={props.renameTarget}
        />
      ) : null}
      {props.deleteTarget ? (
        <DeleteResourceDialog
          actions={props.actions}
          key={`${props.deleteTarget.kind}:${props.deleteTarget.id}`}
          onClose={() => props.onDeleteTargetChange(null)}
          target={props.deleteTarget}
        />
      ) : null}
    </>
  );
}

function CreateResourceDialog({
  actions,
  activeWorkspaceId,
  agents,
  createKind,
  onCreateKindChange,
  workspaces,
}: Pick<
  ClioResourceDialogsProps,
  'actions' | 'activeWorkspaceId' | 'agents' | 'onCreateKindChange' | 'workspaces'
> & { createKind: 'workspace' | 'session' }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const sessionDefaults = useQuery({
    queryKey: queryKeys.key('session-defaults', settings.endpoint),
    queryFn: ({ signal }) => repository.sessionDefaults(signal),
  });
  const [title, setTitle] = useState('');
  const [workspaceId, setWorkspaceId] = useState(activeWorkspaceId);
  const [workspaceName, setWorkspaceName] = useState('');
  const [rootPath, setRootPath] = useState('');
  const [behavior, setBehavior] = useState<Partial<SessionDefaults>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const selectedWorkspaceId = workspaces.some((workspace) => workspace.id === workspaceId)
    ? workspaceId
    : activeWorkspaceId || workspaces[0]?.id || '';
  const agentRef = behavior.agent_ref || sessionDefaults.data?.agent_ref || 'default';
  const decodedMode = behavior.mode || sessionDefaults.data?.mode;
  const decodedRoutingMode = behavior.routing_mode || sessionDefaults.data?.routing_mode;
  const decodedApprovalMode = behavior.approval_mode || sessionDefaults.data?.approval_mode;
  const mode = decodedMode === 'unknown' ? 'edit' : decodedMode || 'edit';
  const routingMode = decodedRoutingMode === 'unknown' ? 'auto' : decodedRoutingMode || 'auto';
  const approvalMode = decodedApprovalMode === 'unknown' ? 'ask' : decodedApprovalMode || 'ask';
  const updateBehavior = <Key extends keyof SessionDefaults>(
    key: Key,
    value: SessionDefaults[Key],
  ) => setBehavior((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    setPending(true);
    setError(undefined);
    try {
      if (createKind === 'workspace') {
        const trimmedPath = rootPath.trim();
        await actions.createWorkspace({
          name:
            workspaceName.trim() ||
            trimmedPath.split(/[\\/]+/).at(-1) ||
            capitalize(vocab.workspace),
          rootPath: trimmedPath,
        });
      } else {
        await actions.createSession({
          title: title.trim(),
          workspaceId: selectedWorkspaceId,
          agentRef: agentRef === 'default' ? undefined : agentRef,
          mode,
          routingMode,
          approvalMode,
        });
      }
      onCreateKindChange(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPending(false);
    }
  };

  const kindLabel = createKind === 'workspace' ? vocab.workspace : createKind;
  return (
    <DialogFrame
      confirm={{
        label: pending ? 'Creating…' : `Create ${kindLabel}`,
        disabled:
          pending ||
          (createKind === 'workspace' ? !rootPath.trim() : !selectedWorkspaceId || !title.trim()),
        onConfirm: () => void submit(),
      }}
      description={`Start a session or create a ${vocab.workspace}.`}
      growDown
      onOpenChange={(open) => onCreateKindChange(open ? createKind : null)}
      open
      title="Create"
      titleActions={
        <SegmentedControl
          className="mr-1"
          label="What to create"
          onValueChange={onCreateKindChange}
          options={[
            { value: 'session', label: 'Session' },
            { value: 'workspace', label: capitalize(vocab.workspace) },
          ]}
          value={createKind}
        />
      }
    >
      <div
        aria-label="Creation options"
        className="-mx-[18px] -mt-2 max-h-[min(34rem,calc(100dvh-var(--dialog-frame-top,1rem)-10rem))] overflow-y-auto px-[18px] [scrollbar-gutter:stable]"
        role="region"
        tabIndex={0}
      >
        <div hidden={createKind !== 'workspace'}>
          <WorkspaceFields
            name={workspaceName}
            onNameChange={setWorkspaceName}
            onPathChange={setRootPath}
            path={rootPath}
            workspaces={workspaces}
          />
        </div>
        <div hidden={createKind !== 'session'}>
          <SessionFields
            approvalMode={approvalMode}
            agents={agents}
            agentRef={agentRef}
            mode={mode}
            onApprovalModeChange={(value) => updateBehavior('approval_mode', value)}
            onAgentRefChange={(value) => updateBehavior('agent_ref', value)}
            onModeChange={(value) => updateBehavior('mode', value)}
            onRoutingModeChange={(value) => updateBehavior('routing_mode', value)}
            onTitleChange={setTitle}
            onWorkspaceIdChange={setWorkspaceId}
            routingMode={routingMode}
            title={title}
            workspaceId={selectedWorkspaceId}
            workspaces={workspaces}
          />
        </div>
        {error ? (
          <p className="mt-2 text-[12.5px] text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </DialogFrame>
  );
}

function WorkspaceFields({
  name,
  onNameChange,
  onPathChange,
  path,
  workspaces,
}: {
  name: string;
  onNameChange: (value: string) => void;
  onPathChange: (value: string) => void;
  path: string;
  workspaces: readonly Workspace[];
}) {
  return (
    <>
      <SettingsRow
        description={`The short name shown throughout the ${vocab.workspace}.`}
        htmlFor="new-workspace-name"
        title={`${capitalize(vocab.workspace)} name`}
      >
        <Input
          autoFocus
          id="new-workspace-name"
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="EarthScope analysis"
          value={name}
        />
      </SettingsRow>
      <SettingsRow
        description={`This becomes the ${vocab.workspace} boundary. Files on disk are not moved.`}
        title={`${capitalize(vocab.workspace)} folder`}
      >
        <ClioPathPicker
          knownFolders={workspaces.flatMap((workspace) =>
            (workspace.source_folders?.length
              ? workspace.source_folders
              : [
                  {
                    name: workspace.display_name,
                    path: workspace.path,
                    primary: true,
                  },
                ]
            ).map((folder) => ({
              name: folder.name,
              path: folder.path,
              detail: `${workspace.display_name}: ${folder.path}`,
            })),
          )}
          onChange={onPathChange}
          placeholder="Choose a folder"
          value={path}
        />
      </SettingsRow>
    </>
  );
}

type SessionFieldsProps = {
  approvalMode: SessionDefaults['approval_mode'];
  agents: readonly AgentEntry[];
  agentRef: string;
  mode: SessionDefaults['mode'];
  onApprovalModeChange: (value: SessionDefaults['approval_mode']) => void;
  onAgentRefChange: (value: string) => void;
  onModeChange: (value: SessionDefaults['mode']) => void;
  onRoutingModeChange: (value: SessionDefaults['routing_mode']) => void;
  onTitleChange: (value: string) => void;
  onWorkspaceIdChange: (value: string) => void;
  routingMode: SessionDefaults['routing_mode'];
  title: string;
  workspaceId: string;
  workspaces: readonly Workspace[];
};

function SessionFields(props: SessionFieldsProps) {
  const approvalOptions = approvalOptionViews(
    SESSION_APPROVAL_OPTIONS,
    useSpotterAvailability(props.workspaceId),
  );
  return (
    <>
      <SettingsRow htmlFor="new-session-title" title="Session name">
        <Input
          autoFocus
          id="new-session-title"
          onChange={(event) => props.onTitleChange(event.target.value)}
          placeholder="Investigate station anomalies"
          value={props.title}
        />
      </SettingsRow>
      <SettingsRow htmlFor="new-session-workspace" title={capitalize(vocab.workspace)}>
        <Select onValueChange={props.onWorkspaceIdChange} value={props.workspaceId}>
          <SelectTrigger className={SELECT_FIELD} id="new-session-workspace">
            <SelectValue placeholder={`Choose a ${vocab.workspace}`} />
          </SelectTrigger>
          <SelectContent>
            {props.workspaces.map((workspace) => (
              <SelectItem key={workspace.id} value={workspace.id}>
                {workspace.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsRow>
      <SettingsRow
        description="The agent's plugins bring its tools, skills and guidance. You can add or remove plugins in the conversation."
        htmlFor="new-session-agent"
        title="Agent"
      >
        <Select onValueChange={props.onAgentRefChange} value={props.agentRef}>
          <SelectTrigger className={SELECT_FIELD} id="new-session-agent">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Default agent</SelectItem>
            {props.agents.map((agent) => (
              <SelectItem key={agent.ref} value={agent.ref}>
                {agent.name || agent.id}
                {agent.kind === 'user' ? ' (yours)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsRow>
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button
            className="group h-9 w-full justify-between px-0 text-[13px] font-normal hover:bg-transparent aria-expanded:bg-transparent dark:hover:bg-transparent"
            type="button"
            variant="ghost"
          >
            Advanced session behavior
            <ChevronDownIcon
              aria-hidden="true"
              className="text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="data-[state=closed]:hidden">
          <BehaviorSelect
            id="new-session-mode"
            label="Default work mode"
            onChange={(value) => {
              const patch = SESSION_MODE_PATCHES[value as SessionDefaults['mode']];
              props.onModeChange(patch.mode as SessionDefaults['mode']);
              props.onRoutingModeChange(patch.routing_mode as SessionDefaults['routing_mode']);
            }}
            options={SESSION_MODE_OPTIONS.map((option) => [option.value, option.label])}
            value={props.mode}
          />
          <BehaviorSelect
            id="new-session-approval"
            label="Confirmations"
            onChange={(value) =>
              props.onApprovalModeChange(value as SessionDefaults['approval_mode'])
            }
            description={unavailableApprovalNotice(approvalOptions) || undefined}
            disabledValues={approvalOptions
              .filter((option) => option.disabled)
              .map((option) => option.value)}
            options={approvalOptions.map((option) => [option.value, option.label])}
            value={props.approvalMode}
          />
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}

function BehaviorSelect({
  description,
  disabledValues = [],
  id,
  label,
  onChange,
  options,
  value,
}: {
  /** Shown under the control, e.g. why the selected value cannot be honoured here. */
  description?: string;
  /** Values the service reports it cannot honour here: listed, not selectable. */
  disabledValues?: readonly string[];
  id: string;
  label: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<readonly [string, string]>;
  value: string;
}) {
  return (
    <SettingsRow htmlFor={id} note={description} title={label}>
      <Select onValueChange={onChange} value={value}>
        <SelectTrigger className={SELECT_FIELD} id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([option, optionLabel]) => {
            const disabled = disabledValues.includes(option);
            return (
              <SelectItem disabled={disabled} key={option} value={option}>
                {disabled ? `${optionLabel} (unavailable)` : optionLabel}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </SettingsRow>
  );
}

export function RenameResourceDialog({
  actions,
  onClose,
  target,
}: {
  actions: ResourceActions;
  onClose: () => void;
  target: ResourceTarget;
}) {
  const [value, setValue] = useState(target.label);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const save = async () => {
    setPending(true);
    setError(undefined);
    try {
      if (target.kind === 'workspace') await actions.renameWorkspace(target.id, value.trim());
      else await actions.renameSession(target.id, value.trim());
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPending(false);
    }
  };
  const name = value.trim();
  const confirm = () => {
    if (name && !pending) void save();
  };
  return (
    <DialogFrame
      confirm={{
        label: pending ? 'Saving?' : 'Save name',
        disabled: pending || !name,
        onConfirm: confirm,
      }}
      description="Its files and history stay as they are."
      icon={<EditIcon />}
      onOpenChange={(open) => !open && onClose()}
      open
      title={`Rename ${target.kind}`}
    >
      <SettingsRow htmlFor="rename-resource" title="Name">
        <Input
          autoFocus
          id="rename-resource"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.ctrlKey || event.metaKey) return;
            event.preventDefault();
            confirm();
          }}
          value={value}
        />
      </SettingsRow>
      {error ? (
        <p className="mt-2 text-[12.5px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </DialogFrame>
  );
}

export function DeleteResourceDialog({
  actions,
  onClose,
  target,
}: {
  actions: ResourceActions;
  onClose: () => void;
  target: ResourceTarget;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const remove = async () => {
    setPending(true);
    setError(undefined);
    try {
      if (target.kind === 'workspace') await actions.deleteWorkspace(target.id);
      else await actions.deleteSession(target.id);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPending(false);
    }
  };
  return (
    <DialogFrame
      alert
      confirm={{
        label: pending ? 'Removing?' : `Remove ${target.kind}`,
        tone: 'destructive',
        disabled: pending,
        onConfirm: () => void remove(),
      }}
      icon={<DeleteIcon />}
      onOpenChange={(open) => !open && onClose()}
      open
      title={`Remove ${target.kind}?`}
    >
      <p className="truncate font-medium" title={target.label}>
        {target.label}
      </p>
      <p className="mt-1 text-muted-foreground">
        {target.kind === 'workspace'
          ? 'This unregisters the workspace and removes its sessions from this service. Files on disk are not deleted.'
          : 'This permanently removes the session and its recorded conversation from this service.'}
      </p>
      {error ? (
        <p className="mt-2 text-[12.5px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </DialogFrame>
  );
}
