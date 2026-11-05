import { lazy, Suspense } from 'react';
import type { AgentEntry, LocalLibrary } from '@clio/core/v3';
import { CopyIcon, FileIcon, FolderIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FileViewerShell } from './file-viewer-shell';

const FileReader = lazy(async () => ({ default: (await import('./file-text-view')).FileTextView }));

/** Storage and backup are source management, separate from browsing saved items. */
export function LocalMarketplaceDetails({
  library,
  pending,
  error,
  onClose,
  onRetry,
}: {
  library?: LocalLibrary;
  pending: boolean;
  error?: string;
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Local marketplace details</DialogTitle>
          <DialogDescription>Saved privately on this host. Nothing is published.</DialogDescription>
        </DialogHeader>
        {pending ? <p role="status">Loading storage locations…</p> : null}
        {error ? <SourceUnavailable onRetry={onRetry} /> : null}
        {library ? (
          <section aria-label="Storage locations" className="grid min-w-0 gap-4">
            <HostFolder label="Agents" path={library.agents_directory} />
            <HostFolder label="Skills and plugins" path={library.plugins_directory} />
          </section>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Use the shared file viewer for the explicitly requested saved definition. */
export function SavedAgentFile({
  agent,
  source,
  pending,
  error,
  onRetry,
  onClose,
}: {
  agent: AgentEntry;
  source?: LocalLibrary['agents'][number];
  pending: boolean;
  error?: string;
  onRetry: () => void;
  onClose: () => void;
}) {
  const text = source ? JSON.stringify(source.definition, null, 2) : '';
  const name = source?.path.split(/[\\/]/).at(-1) || `${agent.id}.json`;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex h-[min(40rem,calc(100dvh-2rem))] min-w-0 flex-col overflow-clip sm:max-w-3xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>{agent.name || agent.id}: saved file</DialogTitle>
          <DialogDescription>Local agent definition</DialogDescription>
        </DialogHeader>
        {pending ? (
          <p role="status">Loading saved file…</p>
        ) : error || !source ? (
          <SourceUnavailable onRetry={onRetry} />
        ) : (
          <>
            <p className="shrink-0 break-all font-mono text-xs text-muted-foreground">
              {source.path}
            </p>
            <div className="min-h-0 flex-1 overflow-hidden rounded-md border">
              <FileViewerShell
                source={{
                  kind: 'provided',
                  name,
                  mediaType: 'application/json',
                  origin: 'Saved agent definition',
                  readBytes: async () => new TextEncoder().encode(text),
                }}
                tabs={[
                  {
                    value: 'preview',
                    label: name,
                    icon: FileIcon,
                    content: (
                      <Suspense fallback={<p role="status">Loading file viewer…</p>}>
                        <FileReader name={name} content={text} view="source" />
                      </Suspense>
                    ),
                  },
                ]}
              />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SourceUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="grid justify-items-start gap-2">
      <p role="alert" className="text-muted-foreground">
        Storage details aren’t available from this host.
      </p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function HostFolder({ label, path }: { label: string; path: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <FolderIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">{label}</p>
        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{path}</p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Copy ${label.toLowerCase()} folder`}
        onClick={() => {
          void navigator.clipboard.writeText(path).then(
            () => toast.success('Folder path copied'),
            () => toast.error('Could not copy folder path'),
          );
        }}
      >
        <CopyIcon aria-hidden="true" />
      </Button>
    </div>
  );
}
