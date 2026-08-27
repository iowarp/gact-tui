import type { AgentBlueprint, SessionDefaults, Workspace } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { ChevronDownIcon } from 'lucide-react';
import { useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ClioPathPicker } from './path-picker';
import {
  SESSION_APPROVAL_OPTIONS,
  SESSION_MODE_OPTIONS,
  SESSION_MODE_PATCHES,
} from './session-behavior-options';

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
    blueprintId?: string;
    mode: 'plan' | 'edit' | 'architect';
    routingMode: 'auto' | 'chat' | 'experts' | 'reasoning_only';
    approvalMode: 'ask' | 'auto-edits' | 'bypass' | 'ai-review' | 'spotter-ai';
  }) => Promise<void>;
  renameWorkspace: (workspaceId: string, name: string) => Promise<void>;
  grantWorkspaceFolder: (workspaceId: string, path: string) => Promise<void>;
  revokeWorkspaceFolder: (workspaceId: string, path: string) => Promise<void>;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  setWorkspacePinned: (workspaceId: string, pinned: boolean) => Promise<void>;
  setSessionPinned: (sessionId: string, pinned: boolean) => Promise<void>;
  archiveSession: (sessionId: string) => Promise<void>;
  restoreSession: (sessionId: string) => Promise<void>;
  deleteWorkspace: (workspaceId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  exportSession: (sessionId: string) => Promise<unknown>;
  importSession: (value: unknown) => Promise<void>;
}

interface ClioResourceDialogsProps {
  actions: ResourceActions;
  activeWorkspaceId: string;
  blueprints: readonly AgentBlueprint[];
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
          blueprints={props.blueprints}
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
  blueprints,
  createKind,
  onCreateKindChange,
  workspaces,
}: Pick<
  ClioResourceDialogsProps,
  'actions' | 'activeWorkspaceId' | 'blueprints' | 'onCreateKindChange' | 'workspaces'
> & { createKind: 'workspace' | 'session' }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const sessionDefaults = useQuery({
    queryKey: ['session-defaults', settings.endpoint],
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
  const blueprintId = behavior.blueprint_id || sessionDefaults.data?.blueprint_id || 'none';
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
          name: workspaceName.trim() || trimmedPath.split(/[\\/]+/).at(-1) || 'Workspace',
          rootPath: trimmedPath,
        });
      } else {
        await actions.createSession({
          title: title.trim(),
          workspaceId: selectedWorkspaceId,
          blueprintId: blueprintId === 'none' ? undefined : blueprintId,
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

  return (
    <Dialog onOpenChange={(open) => onCreateKindChange(open ? createKind : null)} open>
      <DialogContent className="h-[min(560px,calc(100dvh-2rem))] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create</DialogTitle>
          <DialogDescription>
            Start a session in an existing workspace or register another workspace root.
          </DialogDescription>
        </DialogHeader>
        <Tabs
          className="-mr-1 grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4 pr-1"
          onValueChange={(value) => onCreateKindChange(value as 'workspace' | 'session')}
          value={createKind}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="session">Session</TabsTrigger>
            <TabsTrigger value="workspace">Workspace</TabsTrigger>
          </TabsList>
          <div className="min-h-0 overflow-y-auto">
            <TabsContent className="mt-0 data-[state=inactive]:hidden" forceMount value="workspace">
              <WorkspaceFields
                name={workspaceName}
                onNameChange={setWorkspaceName}
                onPathChange={setRootPath}
                path={rootPath}
                workspaces={workspaces}
              />
            </TabsContent>
            <TabsContent className="mt-0 data-[state=inactive]:hidden" forceMount value="session">
              <SessionFields
                approvalMode={approvalMode}
                blueprints={blueprints}
                blueprintId={blueprintId}
                mode={mode}
                onApprovalModeChange={(value) => updateBehavior('approval_mode', value)}
                onBlueprintIdChange={(value) => updateBehavior('blueprint_id', value)}
                onModeChange={(value) => updateBehavior('mode', value)}
                onRoutingModeChange={(value) => updateBehavior('routing_mode', value)}
                onTitleChange={setTitle}
                onWorkspaceIdChange={setWorkspaceId}
                routingMode={routingMode}
                title={title}
                workspaceId={selectedWorkspaceId}
                workspaces={workspaces}
              />
            </TabsContent>
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </Tabs>
        <DialogFooter>
          <Button onClick={() => onCreateKindChange(null)} type="button" variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={
              pending ||
              (createKind === 'workspace'
                ? !rootPath.trim()
                : !selectedWorkspaceId || !title.trim())
            }
            onClick={() => void submit()}
            type="button"
          >
            {pending ? 'Creating…' : `Create ${createKind}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="new-workspace-name">Workspace name</FieldLabel>
        <Input
          autoFocus
          id="new-workspace-name"
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="EarthScope analysis"
          value={name}
        />
        <FieldDescription>The short name shown throughout the workspace.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel>Workspace folder</FieldLabel>
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
          placeholder="Choose the workspace folder"
          value={path}
        />
        <FieldDescription>
          This becomes the workspace boundary. Files on disk are not moved.
        </FieldDescription>
      </Field>
    </FieldGroup>
  );
}

type SessionFieldsProps = {
  approvalMode: SessionDefaults['approval_mode'];
  blueprints: readonly AgentBlueprint[];
  blueprintId: string;
  mode: SessionDefaults['mode'];
  onApprovalModeChange: (value: SessionDefaults['approval_mode']) => void;
  onBlueprintIdChange: (value: string) => void;
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
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="new-session-title">Session name</FieldLabel>
        <Input
          autoFocus
          id="new-session-title"
          onChange={(event) => props.onTitleChange(event.target.value)}
          placeholder="Investigate station anomalies"
          value={props.title}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="new-session-workspace">Workspace</FieldLabel>
        <Select onValueChange={props.onWorkspaceIdChange} value={props.workspaceId}>
          <SelectTrigger id="new-session-workspace">
            <SelectValue placeholder="Choose a workspace" />
          </SelectTrigger>
          <SelectContent>
            {props.workspaces.map((workspace) => (
              <SelectItem key={workspace.id} value={workspace.id}>
                {workspace.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="new-session-blueprint">Agent blueprint</FieldLabel>
        <Select onValueChange={props.onBlueprintIdChange} value={props.blueprintId}>
          <SelectTrigger id="new-session-blueprint">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Standard agent</SelectItem>
            {props.blueprints
              .filter((blueprint) => blueprint.enabled)
              .map((blueprint) => (
                <SelectItem key={blueprint.id} value={blueprint.id}>
                  {blueprint.display_name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <FieldDescription>
          A blueprint adds domain experts, tools, and instructions to this session.
        </FieldDescription>
      </Field>
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button className="group w-full justify-between" type="button" variant="outline">
            Advanced session behavior
            <ChevronDownIcon
              aria-hidden="true"
              className="transition-transform group-data-[state=open]:rotate-180"
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 grid gap-4 rounded-lg border p-4">
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
            options={SESSION_APPROVAL_OPTIONS.map((option) => [option.value, option.label])}
            value={props.approvalMode}
          />
        </CollapsibleContent>
      </Collapsible>
    </FieldGroup>
  );
}

function BehaviorSelect({
  id,
  label,
  onChange,
  options,
  value,
}: {
  id: string;
  label: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<readonly [string, string]>;
  value: string;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select onValueChange={onChange} value={value}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([option, optionLabel]) => (
            <SelectItem key={option} value={option}>
              {optionLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function RenameResourceDialog({
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
  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename {target.kind}</DialogTitle>
          <DialogDescription>
            Change the primary name without changing its files or history.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="rename-resource">Name</FieldLabel>
          <Input
            autoFocus
            id="rename-resource"
            onChange={(event) => setValue(event.target.value)}
            value={value}
          />
        </Field>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button onClick={onClose} type="button" variant="ghost">
            Cancel
          </Button>
          <Button disabled={pending || !value.trim()} onClick={() => void save()} type="button">
            {pending ? 'Saving…' : 'Save name'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteResourceDialog({
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
    <AlertDialog onOpenChange={(open) => !open && onClose()} open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {target.label}?</AlertDialogTitle>
          <AlertDialogDescription>
            {target.kind === 'workspace'
              ? 'This unregisters the workspace and removes its sessions from this service. Files on disk are not deleted.'
              : 'This permanently removes the session and its recorded conversation from this service.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              void remove();
            }}
            variant="destructive"
          >
            {pending ? 'Removing…' : `Remove ${target.kind}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
