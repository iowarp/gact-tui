import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FolderIcon, ArrowUpIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { displayHostPath } from '@/lib/host-path-display';
import { toast } from 'sonner';

/** A folder browser whose every request carries the selected execution host. */
export function HostPathPicker({
  targetId,
  hostLabel,
  label,
  path,
  onChoose,
  disabled,
  startPath,
  triggerLabel = 'Browse…',
  browse,
}: {
  targetId: string;
  hostLabel: string;
  label: string;
  path: string;
  onChoose: (path: string) => void;
  disabled?: boolean;
  startPath?: string;
  triggerLabel?: string;
  browse?: (
    path: string,
    signal: AbortSignal,
  ) => Promise<{
    path: string;
    parent: string;
    entries: { name: string; path: string }[];
    truncated: boolean;
  }>;
}) {
  const repository = useRepository();
  const { settings, isManagedConnection } = useConnectionSettings();
  const [nativePending, setNativePending] = useState(false);
  const [open, setOpen] = useState(false);
  const [folder, setFolder] = useState(path);
  const [entered, setEntered] = useState(path);
  const listing = useQuery({
    queryKey: ['host-folder', connectionScope(settings), targetId, folder],
    enabled: open && (Boolean(folder) || Boolean(browse)),
    queryFn: async ({ signal }) => {
      if (browse) return browse(folder, signal);
      const checked = await repository.inspectHostPath(targetId, { path: folder }, signal);
      return repository.inspectHostPath(
        targetId,
        {
          path: checked.exists ? checked.path : checked.existing_ancestor,
          browse: true,
        },
        signal,
      );
    },
    retry: false,
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        disabled={disabled || nativePending}
        variant="outline"
        aria-label={`Browse ${label.toLowerCase()} on ${hostLabel}`}
        onClick={async () => {
          if (inTauri() && isManagedConnection && targetId === 'local' && !browse) {
            setNativePending(true);
            try {
              const { open: choose } = await import('@tauri-apps/plugin-dialog');
              const selected = await choose({
                directory: true,
                multiple: false,
                defaultPath: displayHostPath(path || startPath || '') || undefined,
              });
              if (typeof selected === 'string') onChoose(selected);
            } catch (error) {
              toast.error('Could not open the folder picker', {
                description: error instanceof Error ? error.message : String(error),
              });
            } finally {
              setNativePending(false);
            }
            return;
          }
          setFolder(path || startPath || '');
          setEntered(path || startPath || '');
          setOpen(true);
        }}
      >
        {triggerLabel}
      </Button>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Choose a folder</DialogTitle>
          <DialogDescription>Browsing {hostLabel}</DialogDescription>
        </DialogHeader>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setFolder(entered);
          }}
        >
          <Input
            aria-label={`Folder path on ${hostLabel}`}
            value={displayHostPath(entered)}
            onChange={(event) => setEntered(event.target.value)}
          />
          <Button type="submit" variant="outline">
            Go
          </Button>
        </form>
        {listing.error ? (
          <p role="alert" className="text-sm text-destructive">
            {listing.error.message}
          </p>
        ) : null}
        {listing.isFetching ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading folders…
          </p>
        ) : null}
        {listing.data ? (
          <>
            <div className="flex items-center gap-2 border-b pb-2">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Parent folder"
                disabled={listing.data.parent === listing.data.path}
                onClick={() => {
                  setFolder(listing.data.parent);
                  setEntered(listing.data.parent);
                }}
              >
                <ArrowUpIcon />
              </Button>
              <span className="min-w-0 break-all text-sm">
                {displayHostPath(listing.data.path)}
              </span>
            </div>
            <div className="max-h-64 overflow-y-auto" aria-label="Folders">
              {listing.data.entries.map((entry) => (
                <Button
                  key={entry.path}
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => {
                    setFolder(entry.path);
                    setEntered(entry.path);
                  }}
                >
                  <FolderIcon />
                  {entry.name}
                </Button>
              ))}
              {!listing.data.entries.length ? (
                <p className="py-4 text-sm text-muted-foreground">No subfolders</p>
              ) : null}
            </div>
            {listing.data.truncated ? (
              <p className="text-sm text-muted-foreground">
                Showing the first 200 folders. Enter a path to open another folder.
              </p>
            ) : null}
          </>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={!listing.data || listing.isFetching || Boolean(listing.error)}
            onClick={() => {
              if (listing.data) {
                onChoose(listing.data.path);
                setOpen(false);
              }
            }}
          >
            Choose folder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
