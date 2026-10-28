import type { Workspace } from '@clio/core/v3';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface MemoryScopeOptions {
  workspaces: Workspace[];
  workspacesLoading?: boolean;
  workspacesError?: string;
  onRetryWorkspaces?: () => void;
}

/** One account/workspace destination picker for manual memories and imports. */
export function MemoryScopePicker({
  id,
  value,
  onChange,
  disabled,
  workspaces,
  workspacesLoading,
  workspacesError,
  onRetryWorkspaces,
}: MemoryScopeOptions & {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>Remember in</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="user">Account (across workspaces)</SelectItem>
          {workspaces
            .filter((workspace) => workspace.id !== 'ws_global')
            .map((workspace) => (
              <SelectItem key={workspace.id} value={`project/${workspace.id}`}>
                {workspace.name}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      {workspacesLoading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading workspaces…
        </p>
      ) : null}
      {workspacesError ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load workspaces: {workspacesError}{' '}
          <button type="button" className="underline" onClick={onRetryWorkspaces}>
            Retry
          </button>
        </p>
      ) : null}
    </div>
  );
}
