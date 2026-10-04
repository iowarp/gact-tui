import type { SourceProvider, WorkspaceReference } from '@clio/core/v3';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { ArrowRightIcon, DatabaseIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ConnectedSourceForm } from './connected-source-form';
import { sourceModeNames } from './connected-source-labels';
import { ConnectedSourceDetail } from './connected-source-detail';
import { SourceProviderLogo } from './source-provider-logo';
import { InfoTip } from './info-tip';
import { DesktopFolderUpload } from './desktop-folder-upload';

/** The same trusted connection and browse surface serves the composer and Files tab. */
export function ConnectedSourcePicker({
  workspaceId,
  open,
  onOpenChange,
  onSelect,
  onChanged,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect?: (reference: WorkspaceReference) => void;
  onChanged?: () => void;
}) {
  const { settings } = useConnectionSettings();
  const titleRef = useRef<HTMLHeadingElement>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[88dvh] flex-col overflow-hidden sm:max-w-2xl"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleRef.current?.focus();
        }}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle ref={titleRef} tabIndex={-1} className="outline-none">
            Connected data
          </DialogTitle>
          <DialogDescription>
            Choose inputs for this workspace on the connected CLIO.
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-4 min-h-0 overflow-y-auto px-4">
          {open && (
            <PickerContents
              key={`${settings.endpoint}:${workspaceId}`}
              workspaceId={workspaceId}
              onSelect={onSelect}
              onChanged={onChanged}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PickerContents({
  workspaceId,
  onSelect,
  onChanged,
}: {
  workspaceId: string;
  onSelect?: (reference: WorkspaceReference) => void;
  onChanged?: () => void;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const queryClient = useQueryClient();
  const key = ['connected-storage', settings.endpoint, workspaceId];
  // Endpoint-bound selection survives closing and reopening the same workspace picker.
  const selectionKey = ['connected-storage-selection', settings.endpoint, workspaceId];
  const selection = useQuery({
    queryKey: selectionKey,
    queryFn: () => '',
    initialData: '',
    staleTime: Infinity,
  });
  const select = (id: string) => queryClient.setQueryData(selectionKey, id);
  const [provider, setProvider] = useState<SourceProvider>();
  const [desktopUpload, setDesktopUpload] = useState(false);
  const sources = useQuery({
    queryKey: [...key, 'sources'],
    queryFn: ({ signal }) => repository.connectedSources(workspaceId, signal),
    refetchInterval: 1500,
    retry: false,
  });
  const providers = useQuery({
    queryKey: [...key, 'providers'],
    queryFn: ({ signal }) => repository.storageProviders(signal),
    retry: false,
  });
  const host = useQuery({
    queryKey: ['host-storage', settings.endpoint, 'local'],
    queryFn: ({ signal }) => repository.hostStorageSettings('local', signal),
    retry: false,
  });
  const hostLabel = host.data?.hostname
    ? `${host.data.host_label} · ${host.data.hostname}`
    : (host.data?.host_label ?? 'the connected CLIO');
  const source = sources.data?.find((row) => row.id === selection.data);
  if (desktopUpload)
    return (
      <DesktopFolderUpload
        workspaceId={workspaceId}
        hostLabel={hostLabel}
        onBack={() => setDesktopUpload(false)}
        onComplete={(connected) => {
          queryClient.setQueryData(
            [...key, 'sources'],
            [...(sources.data ?? []).filter((row) => row.id !== connected.id), connected],
          );
          select(connected.id);
          setDesktopUpload(false);
          onChanged?.();
        }}
      />
    );
  if (provider)
    return (
      <ConnectedSourceForm
        workspaceId={workspaceId}
        provider={provider}
        hostLabel={hostLabel}
        onBack={() => setProvider(undefined)}
        onConnected={(connected) => {
          queryClient.setQueryData([...key, 'sources'], [...(sources.data ?? []), connected]);
          select(connected.id);
          setProvider(undefined);
        }}
      />
    );
  if (source)
    return (
      <ConnectedSourceDetail
        key={source.id}
        workspaceId={workspaceId}
        source={source}
        hostLabel={hostLabel}
        onBack={() => select('')}
        onSelect={onSelect}
        onChanged={() => onChanged?.()}
      />
    );
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <DatabaseIcon aria-hidden="true" className="size-4" />
        <span className="min-w-0 truncate">{hostLabel}</span>
        <InfoTip label="About connected data">
          Files are staged on this CLIO. Local paths refer to this machine. Desktop folders use the
          explicit upload action; no background synchronization is implied.
        </InfoTip>
      </div>
      {(sources.error || providers.error) && (
        <p role="alert" className="text-sm text-destructive">
          {(sources.error || providers.error)?.message}
        </p>
      )}
      {sources.isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading sources…
        </p>
      )}
      {sources.data?.length ? (
        <section className="space-y-2" aria-label="Your connected sources">
          <h3 className="text-sm font-medium">Your sources</h3>
          <div className="divide-y rounded-lg border">
            {sources.data.map((row) => (
              <button
                key={row.id}
                className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/40 focus-visible:outline-ring"
                onClick={() => select(row.id)}
              >
                <SourceProviderLogo provider={row.provider} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{row.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {sourceModeNames[row.mode ?? 'read_only']} ·{' '}
                    {!row.connected ? 'Disconnected' : row.materialization?.replaceAll('_', ' ')}
                  </span>
                </span>
                <ArrowRightIcon aria-hidden="true" className="size-4 shrink-0" />
              </button>
            ))}
          </div>
        </section>
      ) : !sources.isPending && !sources.error ? (
        <div className="rounded-lg border border-dashed px-4 py-6 text-center">
          <FolderEmpty />
          <p className="mt-2 text-sm font-medium">Bring your data into this workspace</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Connect a folder to browse and attach its files.
          </p>
        </div>
      ) : null}
      <section className="space-y-2" aria-label="Connect a data source">
        <h3 className="text-sm font-medium">Connect a source</h3>
        <div className="divide-y rounded-lg border">
          {providers.data?.providers.map((row) => (
            <div key={row.id} className="flex items-center gap-3 p-3">
              <SourceProviderLogo provider={row.id} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{row.name}</p>
                <p className="text-xs text-muted-foreground">
                  {row.id === 'local'
                    ? hostLabel
                    : row.authentication === 'browser'
                      ? 'Browser sign in'
                      : 'Existing SSH profile'}
                </p>
              </div>
              {!row.configured && (
                <InfoTip label={`About ${row.name} availability`}>{row.setup_requirement}</InfoTip>
              )}
              <Button size="sm" variant="outline" onClick={() => setProvider(row)}>
                Connect
              </Button>
            </div>
          ))}
        </div>
      </section>
      <Button variant="outline" className="w-full" onClick={() => setDesktopUpload(true)}>
        Upload a folder from this computer
      </Button>
    </div>
  );
}

function FolderEmpty() {
  return <DatabaseIcon aria-hidden="true" className="mx-auto size-6 text-muted-foreground" />;
}
