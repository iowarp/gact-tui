import { queryKeys } from '@/lib/query-keys';
import type { AgentEntry, SessionDefaults, Workspace } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { ChevronDownIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  SESSION_APPROVAL_OPTIONS,
  SESSION_MODE_OPTIONS,
  SESSION_MODE_PATCHES,
} from './session-behavior-options';

const SELECT_FIELD =
  'w-full min-w-0 px-[9px] text-[0.78125rem] data-[size=default]:h-[1.875rem] data-[size=default]:rounded-md';
const TEXT_FIELD = 'h-[30px] text-[12.5px] md:text-[12.5px]';

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
  /** Branches a conversation into a new one and opens it. */
  forkSession?: (sessionId: string) => Promise<void>;
  /** Appends a compaction checkpoint and reports whether the service compacted. */
  compactSession?: (sessionId: string) => Promise<void>;
  /** Permanently removes the conversation's last stored message. */
  undoSession?: (sessionId: string) => Promise<void>;
  /** Mints a read-only share link and resolves to its absolute URL. */
  shareSession?: (sessionId: string, ttlSeconds: number) => Promise<string>;
  /** Desktop only: opens the OS terminal app at a workspace folder. */
  openSystemTerminal?: (workspacePath: string) => Promise<void>;
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

  // One kind per dialog, chosen by the control that opened it (spec: no Session|Workspace toggle).
  const kindLabel = createKind === 'workspace' ? vocab.workspace : 'conversation';
  return (
    <DialogFrame
      confirm={{
        label: pending ? 'Creating…' : `Create ${kindLabel}`,
        disabled:
          pending ||
          (createKind === 'workspace' ? !rootPath.trim() : !selectedWorkspaceId || !title.trim()),
        onConfirm: () => void submit(),
      }}
      description={
        createKind === 'workspace'
          ? `Name it and choose the folder it works in.`
          : `Name it and choose where it runs.`
      }
      growDown
      onOpenChange={(open) => onCreateKindChange(open ? createKind : null)}
      open
      title={`New ${kindLabel}`}
    >
      <div
        aria-label="Creation options"
        className="-mx-[18px] -mt-2 max-h-[min(34rem,calc(100dvh-var(--dialog-frame-top,1rem)-10rem))] overflow-y-auto px-[18px] pt-0.5 pb-1 [scrollbar-gutter:stable]"
        role="region"
        tabIndex={0}
      >
        {createKind === 'workspace' ? (
          <WorkspaceFields
            name={workspaceName}
            onNameChange={setWorkspaceName}
            onPathChange={setRootPath}
            path={rootPath}
            workspaces={workspaces}
          />
        ) : (
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
        )}
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
    <div className="grid gap-3">
      <StackedField htmlFor="new-workspace-name" label={`${capitalize(vocab.workspace)} name`}>
        <Input
          autoFocus
          className={TEXT_FIELD}
          id="new-workspace-name"
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="EarthScope analysis"
          value={name}
        />
      </StackedField>
      <StackedField
        description={`This becomes the ${vocab.workspace} boundary. Files on disk are not moved.`}
        htmlFor="new-workspace-folder"
        label={`${capitalize(vocab.workspace)} folder`}
      >
        <ClioPathPicker
          className="h-[30px]"
          inputId="new-workspace-folder"
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
      </StackedField>
    </div>
  );
}

/** Spec `.xf`: a 12px label above a full-width 30px field, with an optional note below. */
function StackedField({
  children,
  description,
  htmlFor,
  label,
}: {
  children: ReactNode;
  description?: string;
  htmlFor: string;
  label: string;
}) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <Label
        className="text-xs font-normal whitespace-nowrap text-muted-foreground"
        htmlFor={htmlFor}
      >
        {label}
      </Label>
      {children}
      {description ? (
        <p className="text-[11.5px] leading-snug text-muted-foreground">{description}</p>
      ) : null}
    </div>
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
    <div className="grid gap-3">
      <StackedField htmlFor="new-session-title" label="Conversation name">
        <Input
          autoFocus
          className={TEXT_FIELD}
          id="new-session-title"
          onChange={(event) => props.onTitleChange(event.target.value)}
          placeholder="Investigate station anomalies"
          value={props.title}
        />
      </StackedField>
      <StackedField htmlFor="new-session-workspace" label={capitalize(vocab.workspace)}>
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
      </StackedField>
      <StackedField
        description="The agent's plugins bring its tools, skills and guidance. You can add or remove plugins in the conversation."
        htmlFor="new-session-agent"
        label="Agent"
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
      </StackedField>
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button
            className="group h-7 w-full justify-between px-0 text-[12.5px] font-normal hover:bg-transparent aria-expanded:bg-transparent dark:hover:bg-transparent"
            type="button"
            variant="ghost"
          >
            Advanced behavior
            <ChevronDownIcon
              aria-hidden="true"
              className="text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="grid gap-3 pt-1 data-[state=closed]:hidden">
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
    </div>
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
    <StackedField description={description} htmlFor={id} label={label}>
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
    </StackedField>
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
        label: pending ? 'Saving…' : 'Save name',
        disabled: pending || !name,
        onConfirm: confirm,
      }}
      description="Its files and history stay as they are."
      icon={<EditIcon />}
      onOpenChange={(open) => !open && onClose()}
      open
      title={target.kind === 'session' ? 'Rename conversation' : `Rename ${vocab.workspace}`}
    >
      {/* Label over a full-width field (spec .xf), so the current name reads in full. */}
      <div className="grid gap-1.5">
        <Label htmlFor="rename-resource" className="text-xs font-normal text-muted-foreground">
          Name
        </Label>
        <Input
          className="h-[30px] text-[12.5px] md:text-[12.5px]"
          data-initial-focus=""
          id="rename-resource"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.ctrlKey || event.metaKey) return;
            event.preventDefault();
            confirm();
          }}
          value={value}
        />
      </div>
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
  const session = target.kind === 'session';
  return (
    <DialogFrame
      alert
      cancelLabel={session ? 'Keep conversation' : `Keep ${vocab.workspace}`}
      confirm={{
        label: session
          ? pending
            ? 'Deleting…'
            : 'Delete permanently'
          : pending
            ? 'Removing…'
            : `Remove ${vocab.workspace}`,
        tone: 'destructive',
        disabled: pending,
        onConfirm: () => void remove(),
      }}
      description={
        session
          ? 'Removes it and its record from the service. This can’t be undone.'
          : `Unregisters the ${vocab.workspace} and removes its conversations from the service. Files on disk are not deleted.`
      }
      icon={<DeleteIcon />}
      onOpenChange={(open) => !open && onClose()}
      open
      title={`${session ? 'Delete' : 'Remove'} ${target.label}?`}
    >
      {error ? (
        <p className="text-[12.5px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </DialogFrame>
  );
}
