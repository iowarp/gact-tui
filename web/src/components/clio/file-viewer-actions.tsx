import { useMutation } from '@tanstack/react-query';
import { CopyPlusIcon, DownloadIcon, Maximize2Icon, Minimize2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useRepository } from '@/hooks/use-repository';
import { formatBytes } from '@/lib/format';
import { DeleteIcon, InfoIcon, MoreIcon } from '@/lib/icon-vocabulary';
import { FileCopyDialog } from './file-copy-dialog';
import type { FileViewerAction } from './file-viewer-action-context';
import {
  fileViewerIdentity,
  readFileViewerBytes,
  type FileViewerSource,
} from './file-viewer-source';
import { downloadBytes } from './surface-export';
import { ToolbarAction } from './viewer-toolbar';
import { WorkspaceResourceRemoveDialog } from './workspace-resource-remove';

/** Shared original-file actions for uploads, artifacts and workspace files. */
export function FileViewerActions({
  source,
  fullscreen,
  onFullscreen,
  onInformationHost,
  formatActions,
}: {
  source: FileViewerSource;
  fullscreen: boolean;
  onFullscreen: () => void;
  onInformationHost: (host: HTMLDivElement | null) => void;
  formatActions: readonly FileViewerAction[];
}) {
  const repository = useRepository();
  const [copyOpen, setCopyOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [informationOpen, setInformationOpen] = useState(false);
  const identity = fileViewerIdentity(source);
  const download = useMutation({
    mutationFn: async () =>
      downloadBytes(
        await readFileViewerBytes(repository, source),
        identity.mediaType,
        identity.name,
      ),
    onError: (error: Error) => toast.error(error.message),
  });
  const canRemove =
    source.kind === 'resource' &&
    ['ready', 'failed', 'quarantined'].includes(source.resource.state);
  return (
    <>
      <ToolbarAction
        label={download.isPending ? 'Downloading file…' : 'Download file'}
        disabled={!identity.available || download.isPending}
        aria-busy={download.isPending}
        onClick={() => download.mutate()}
      >
        <DownloadIcon aria-hidden="true" />
      </ToolbarAction>
      <ToolbarAction
        label="File information"
        className="@max-[480px]/viewer:hidden"
        onClick={() => setInformationOpen(true)}
      >
        <InfoIcon aria-hidden="true" />
      </ToolbarAction>
      <Dialog open={informationOpen} onOpenChange={setInformationOpen}>
        <DialogContent className="space-y-2">
          <DialogHeader>
            <DialogTitle className="break-words pr-6">{identity.name}</DialogTitle>
            <DialogDescription>
              {identity.origin} ·{' '}
              {identity.size === undefined ? 'Size unavailable' : formatBytes(identity.size)}
            </DialogDescription>
          </DialogHeader>
          <p className="break-all text-xs text-muted-foreground">{identity.mediaType}</p>
          {source.kind === 'resource' ? (
            <p className="text-xs text-muted-foreground">Upload: {source.resource.state}</p>
          ) : null}
          {source.kind === 'workspace' ? (
            <p className="break-all font-mono text-xs">{source.path}</p>
          ) : null}
          <div className="space-y-1.5" ref={onInformationHost} />
        </DialogContent>
      </Dialog>
      <ToolbarAction
        label={fullscreen ? 'Exit file fullscreen' : 'View file fullscreen'}
        className="@max-[480px]/viewer:hidden"
        onClick={onFullscreen}
      >
        {fullscreen ? <Minimize2Icon aria-hidden="true" /> : <Maximize2Icon aria-hidden="true" />}
      </ToolbarAction>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <ToolbarAction label="File actions">
            <MoreIcon aria-hidden="true" />
          </ToolbarAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {formatActions.map(({ label, icon: Icon, onSelect, disabled }) => (
            <DropdownMenuItem key={label} onSelect={onSelect} disabled={disabled}>
              <Icon />
              {label}
            </DropdownMenuItem>
          ))}
          {formatActions.length ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem onSelect={() => setInformationOpen(true)}>
            <InfoIcon />
            File information
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onFullscreen}>
            {fullscreen ? <Minimize2Icon /> : <Maximize2Icon />}
            {fullscreen ? 'Exit file fullscreen' : 'View file fullscreen'}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!identity.available} onSelect={() => setCopyOpen(true)}>
            <CopyPlusIcon />
            Copy to another workspace
          </DropdownMenuItem>
          {canRemove ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setRemoveOpen(true)}>
                <DeleteIcon />
                Remove from this workspace
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <FileCopyDialog source={source} open={copyOpen} onOpenChange={setCopyOpen} />
      {source.kind === 'resource' ? (
        <WorkspaceResourceRemoveDialog
          resource={source.resource}
          workspaceId={source.workspaceId}
          open={removeOpen}
          onOpenChange={setRemoveOpen}
        />
      ) : null}
    </>
  );
}
