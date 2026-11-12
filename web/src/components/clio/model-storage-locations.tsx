import type { HostStorageLocations } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { FolderIcon, HardDriveIcon } from 'lucide-react';
import { EditIcon } from '@/lib/icon-vocabulary';
import { displayHostPath } from '@/lib/host-path-display';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { Button } from '@/components/ui/button';
import { DialogFrame } from './primitives/dialog-frame';
import { KeyValueGrid } from './primitives/key-value-grid';
import { ListGroupLabel } from './primitives/list-row';
import { StateView } from './primitives/state-view';
import { MiddleTruncate } from './primitives/truncate';
import { HostStorageSettings, type HostStorageSaveState } from './host-storage-settings';

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
  const [saveState, setSaveState] = useState<HostStorageSaveState | null>(null);
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
            className="h-6 text-label text-link"
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
            .map(({ key, label, root }) => {
              const path = displayHostPath(effective[key] ?? '');
              return {
                label,
                icon: root ? <HardDriveIcon /> : <FolderIcon />,
                value: <MiddleTruncate className="justify-end">{path}</MiddleTruncate>,
                title: path,
                mono: true,
              };
            })}
        />
      )}
      <DialogFrame
        open={editing}
        onOpenChange={setEditing}
        icon={<HardDriveIcon />}
        title={`Storage on ${hostLabel}`}
        description={`Paths are on ${hostLabel}. New deployments inherit these locations.`}
        bodyInset="edge"
        confirm={{
          label: saveState?.pending ? 'Saving…' : 'Save locations',
          onConfirm: () => saveState?.submit(),
          disabled: !saveState || saveState.disabled,
        }}
        // 36% of the window (340-640 px); DialogFrame's bottom sheet under 600 px.
        className="w-[clamp(340px,36vw,640px)]"
      >
        <HostStorageSettings
          key={targetId}
          onSaveState={setSaveState}
          onSaved={() => setEditing(false)}
          targetId={targetId}
        />
      </DialogFrame>
    </div>
  );
}
