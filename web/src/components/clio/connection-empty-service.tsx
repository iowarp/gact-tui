import type { Workspace } from '@clio/core/v3';
import { FolderPlusIcon, MessageSquarePlusIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ClioPathPicker } from './path-picker';

const createWorkspaceValue = '__create_workspace__';

interface EmptyServiceSetupInput {
  workspaceId?: string;
  workspaceName?: string;
  rootPath?: string;
  sessionTitle: string;
}

interface ConnectionEmptyServiceProps {
  error?: string;
  pending?: boolean;
  workspaces: readonly Workspace[];
  onCreate: (input: EmptyServiceSetupInput) => Promise<void>;
}

/** Guides a connected empty service into its first usable conversation. */
export function ConnectionEmptyService({
  error,
  pending,
  workspaces,
  onCreate,
}: ConnectionEmptyServiceProps) {
  const [workspaceChoice, setWorkspaceChoice] = useState(workspaces[0]?.id ?? createWorkspaceValue);
  const [workspaceName, setWorkspaceName] = useState('My workspace');
  const [rootPath, setRootPath] = useState('');
  const [sessionTitle, setSessionTitle] = useState('First conversation');
  const creatingWorkspace = workspaceChoice === createWorkspaceValue;
  const canSubmit =
    Boolean(sessionTitle.trim()) &&
    (!creatingWorkspace || (Boolean(workspaceName.trim()) && Boolean(rootPath.trim())));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    await onCreate({
      workspaceId: creatingWorkspace ? undefined : workspaceChoice,
      workspaceName: creatingWorkspace ? workspaceName.trim() : undefined,
      rootPath: creatingWorkspace ? rootPath.trim() : undefined,
      sessionTitle: sessionTitle.trim(),
    });
  };

  return (
    <form className="grid gap-5" onSubmit={(event) => void submit(event)}>
      <Alert>
        <FolderPlusIcon aria-hidden="true" />
        <AlertTitle>This service is ready</AlertTitle>
        <AlertDescription>
          Choose where the agent may work, then open its first conversation.
        </AlertDescription>
      </Alert>

      {workspaces.length ? (
        <div className="grid gap-2">
          <Label htmlFor="first-workspace">Workspace</Label>
          <Select onValueChange={setWorkspaceChoice} value={workspaceChoice}>
            <SelectTrigger className="h-11" id="first-workspace">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {workspaces.map((workspace) => (
                <SelectItem key={workspace.id} value={workspace.id}>
                  {workspace.display_name}
                </SelectItem>
              ))}
              <SelectItem value={createWorkspaceValue}>Create another workspace</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {creatingWorkspace ? (
        <>
          <div className="grid gap-2">
            <Label htmlFor="first-workspace-name">Workspace name</Label>
            <Input
              autoComplete="off"
              className="h-11"
              id="first-workspace-name"
              onChange={(event) => setWorkspaceName(event.target.value)}
              value={workspaceName}
            />
          </div>
          <div className="grid gap-2">
            <Label>Working folder</Label>
            <ClioPathPicker
              knownFolders={workspaces.map((workspace) => ({
                detail: workspace.path,
                name: workspace.display_name,
                path: workspace.path,
              }))}
              onChange={setRootPath}
              placeholder="Choose a folder on this service"
              value={rootPath}
            />
          </div>
        </>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="first-session-title">Conversation name</Label>
        <Input
          autoComplete="off"
          className="h-11"
          id="first-session-title"
          onChange={(event) => setSessionTitle(event.target.value)}
          value={sessionTitle}
        />
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not create the first conversation</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Button className="h-11 justify-between" disabled={!canSubmit || pending} type="submit">
        {pending ? 'Creating…' : 'Create and open conversation'}
        <MessageSquarePlusIcon aria-hidden="true" />
      </Button>
    </form>
  );
}
