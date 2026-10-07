import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { uploadWorkspaceResources } from '@/lib/upload-workspace-resources';
import { useConnectionSettings } from '@/providers/connection-provider';
import {
  fileViewerIdentity,
  readFileViewerBytes,
  type FileViewerSource,
} from './file-viewer-source';

/** Copies original files into another workspace on this same connected agent. */
export function FileCopyDialog({
  source,
  open,
  onOpenChange,
}: {
  source: FileViewerSource;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const [destination, setDestination] = useState('');
  const operationId = useRef<string | undefined>(undefined);
  const identity = fileViewerIdentity(source);
  const workspaces = useQuery({
    queryKey: queryKeys.workspaces(settings.endpoint),
    queryFn: ({ signal }) => repository.workspaces(signal),
    enabled: open,
  });
  const choices = useMemo(
    () => (workspaces.data ?? []).filter((workspace) => workspace.id !== source.workspaceId),
    [source.workspaceId, workspaces.data],
  );
  const copy = useMutation({
    mutationFn: async () => {
      if (source.kind === 'resource') {
        return repository.copyResource(source.workspaceId, source.resource.id, destination);
      }
      // Artifacts and workspace files use the same resumable custody API as
      // uploads. A retry reuses its operation ID; a new copy gets a fresh one.
      operationId.current ??= nanoid();
      const bytes = await readFileViewerBytes(repository, source);
      const { resources } = await uploadWorkspaceResources({
        repository,
        workspaceId: destination,
        files: [
          {
            type: 'file',
            filename: identity.name,
            mediaType: identity.mediaType,
            url: '',
            file: new Blob([Uint8Array.from(bytes).buffer], { type: identity.mediaType }),
            clientUploadId: `workspace-copy-${operationId.current}-${destination}`,
          },
        ],
      });
      const copied = resources[0];
      if (!copied) throw new Error('The agent did not register the copied file.');
      return copied;
    },
    onSuccess: async (copied) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.workspaceResources(settings.endpoint, copied.workspace_id),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.workspaceFiles(settings.endpoint, copied.workspace_id),
        }),
      ]);
      toast.success(`Copied ${identity.name}`);
      onOpenChange(false);
      setDestination('');
      operationId.current = undefined;
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!copy.isPending) onOpenChange(value);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copy to another workspace</DialogTitle>
          <DialogDescription>
            Creates an independent file in another workspace on this connected agent. The original
            stays in its workspace.
          </DialogDescription>
        </DialogHeader>
        <p className="truncate text-sm font-medium" title={identity.name}>
          {identity.name}
        </p>
        <Select onValueChange={setDestination} value={destination} disabled={copy.isPending}>
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
        {copy.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {copy.error.message}
          </p>
        ) : null}
        <DialogFooter>
          <Button disabled={copy.isPending} onClick={() => onOpenChange(false)} variant="outline">
            Cancel
          </Button>
          <Button
            disabled={!destination || copy.isPending || !identity.available}
            onClick={() => copy.mutate()}
          >
            {copy.isPending ? 'Copying…' : 'Copy file'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
