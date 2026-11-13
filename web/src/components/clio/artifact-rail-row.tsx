import type { Artifact } from '@clio/core/v3';
import { DownloadIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { artifactDisplayName } from '@/lib/dashboard-presentation';
import { formatBytes } from '@/lib/format';
import { ArtifactTypeIcon } from './artifact-type-icon';
import { Spinner } from '@/components/ui/spinner';
import { downloadBytes } from './surface-export';
import { t } from '@lingui/core/macro';

/** Rail inventory stays one line; the artifact's full card belongs in its main view. */
export function ArtifactRailRow({ artifact, onOpen }: { artifact: Artifact; onOpen?: () => void }) {
  const repository = useRepository();
  const [pending, setPending] = useState(false);
  const name = artifactDisplayName(artifact);
  const download = async () => {
    if (pending) return;
    setPending(true);
    try {
      const bytes = await repository.readArtifactBytesFor(artifact);
      downloadBytes(bytes, artifact.media_type || 'application/octet-stream', artifact.name);
    } catch (error) {
      toast.error(t`Could not download artifact`, {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="group/artifact flex min-w-0 items-center gap-1" data-slot="artifact-rail-row">
      <Button
        type="button"
        variant="ghost"
        onClick={onOpen}
        aria-label={t`Open ${name}`}
        title={name}
        className="h-8 min-w-0 flex-1 justify-start gap-2 px-1 text-xs font-normal"
      >
        <ArtifactTypeIcon artifact={artifact} className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">{name}</span>
        {artifact.size === undefined ? null : (
          <span className="shrink-0 text-[0.625rem] text-muted-foreground">
            {formatBytes(artifact.size)}
          </span>
        )}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-7 shrink-0 text-muted-foreground"
        aria-label={t`Download ${name}`}
        title={t`Download ${name}`}
        disabled={pending}
        onClick={() => void download()}
      >
        {pending ? <Spinner className="size-3.5" /> : <DownloadIcon className="size-3.5" />}
      </Button>
    </div>
  );
}
