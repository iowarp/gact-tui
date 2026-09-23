import type { WorkspaceResource } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CopyPlusIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';

/** Copies a ready resource only to a workspace owned by the connected agent. */
export function WorkspaceResourceCopyAction({
  resource,
  workspaceId,
}: {
  resource: WorkspaceResource;
  workspaceId: string;
}) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState('');
  const workspaces = useQuery({
    queryKey: queryKeys.workspaces(settings.endpoint),
    queryFn: ({ signal }) => repository.workspaces(signal),
    enabled: open,
  });
  const choices = useMemo(
    () => (workspaces.data ?? []).filter((workspace) => workspace.id !== workspaceId),
    [workspaceId, workspaces.data],
  );
  const copy = useMutation({
    mutationFn: () => repository.copyResource(workspaceId, resource.id, destination),
    onSuccess: async (copied) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.workspaceResources(settings.endpoint, copied.workspace_id),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.workspaceFiles(settings.endpoint, copied.workspace_id),
        }),
      ]);
      toast.success(`Copied ${resource.name}`);
      setOpen(false);
      setDestination('');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (resource.state !== 'ready') return null;

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button
          aria-label={`Copy ${resource.name} to another workspace`}
          className="size-8 shrink-0"
          size="icon-sm"
          title="Copy to another workspace"
          variant="ghost"
        >
          <CopyPlusIcon aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copy to another workspace</DialogTitle>
          <DialogDescription>
            Creates a separate resource and working copy on this connected agent.
          </DialogDescription>
        </DialogHeader>
        <Select onValueChange={setDestination} value={destination}>
          <SelectTrigger aria-label="Destination workspace">
            {destination
              ? choices.find((workspace) => workspace.id === destination)?.display_name ||
                choices.find((workspace) => workspace.id === destination)?.name
              : workspaces.isPending
                ? 'Loading workspaces…'
                : 'Choose a workspace'}
          </SelectTrigger>
          <SelectContent>
            {choices.map((workspace) => (
              <SelectItem key={workspace.id} value={workspace.id}>
                {workspace.display_name || workspace.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {workspaces.isError ? (
          <p className="text-sm text-destructive">{workspaces.error.message}</p>
        ) : !workspaces.isPending && choices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No other workspace is available.</p>
        ) : null}
        <DialogFooter>
          <Button onClick={() => setOpen(false)} variant="outline">
            Cancel
          </Button>
          <Button disabled={!destination || copy.isPending} onClick={() => copy.mutate()}>
            {copy.isPending ? 'Copying…' : 'Copy resource'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
