import type { HostStorageLocations } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { FolderIcon, HardDriveIcon } from 'lucide-react';
import { EditIcon } from '@/lib/icon-vocabulary';
import { DIALOG_FULL_WINDOW_CLASS } from '@/lib/dialog-sheet';
import { cn } from '@/lib/utils';
import { displayHostPath } from '@/lib/host-path-display';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { KeyValueGrid } from './primitives/key-value-grid';
import { ListGroupLabel } from './primitives/list-row';
import { StateView } from './primitives/state-view';
import { HostStorageSettings } from './host-storage-settings';

const locations: { key: keyof HostStorageLocations; label: string; root?: boolean }[] = [
  { key: 'root', label: 'Storage root', root: true },
  { key: 'models', label: 'Models' },
  { key: 'service_data', label: 'Service data' },
  { key: 'captures', label: 'Evidence captures' },
  { key: 'temporary', label: 'Temporary files' },
];

/** Where new downloads and deployments go on the selected computer, with one way to change it. */
export function ModelStorageLocations({
  targetId,
  hostLabel,
}: {
  targetId: string;
  hostLabel: string;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const [editing, setEditing] = useState(false);
  const storage = useQuery({
    queryKey: ['host-storage', settings.endpoint, targetId],
    queryFn: ({ signal }) => repository.hostStorageSettings(targetId, signal),
    retry: false,
  });
  const effective = storage.data?.effective;
  return (
    <div className="mt-3 flex min-w-0 flex-col">
      <ListGroupLabel
        action={
          <Button
            className="h-6 text-[11.5px] text-link"
            onClick={() => setEditing(true)}
            size="xs"
            variant="ghost"
          >
            <EditIcon aria-hidden="true" /> Edit locations
          </Button>
        }
      >
        Storage on {hostLabel}
      </ListGroupLabel>
      {storage.error ? (
        <StateView
          action={{ label: 'Retry', onClick: () => void storage.refetch() }}
          detail={storage.error.message}
          kind="error"
          size="row"
          title="Could not read storage locations"
        />
      ) : !effective ? (
        <StateView kind="loading" size="row" title="Loading storage locations…" />
      ) : (
        <KeyValueGrid
          className="px-2"
          items={locations
            .filter(({ key }) => effective[key])
            .map(({ key, label, root }) => ({
              label,
              icon: root ? <HardDriveIcon /> : <FolderIcon />,
              value: displayHostPath(effective[key] ?? ''),
              mono: true,
            }))}
        />
      )}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent
          className={cn(
            'max-h-[90dvh] overflow-y-auto sm:max-w-[clamp(340px,36vw,640px)] max-[599px]:content-start',
            DIALOG_FULL_WINDOW_CLASS,
          )}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HardDriveIcon aria-hidden="true" className="size-4 text-muted-foreground" />
              Storage on {hostLabel}
            </DialogTitle>
            <DialogDescription>
              Paths are on {hostLabel}. New deployments inherit these locations.
            </DialogDescription>
          </DialogHeader>
          <HostStorageSettings
            key={targetId}
            onCancel={() => setEditing(false)}
            onSaved={() => setEditing(false)}
            targetId={targetId}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
