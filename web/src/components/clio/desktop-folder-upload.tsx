import type { ConnectedSourceState } from '@clio/core/v3';
import { sha256 } from '@noble/hashes/sha2.js';
import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { FolderUpIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRepository } from '@/hooks/use-repository';
import { uploadWorkspaceResources } from '@/lib/upload-workspace-resources';
import { InfoTip } from './info-tip';

/** Explicit, resumable desktop-to-connected-CLIO transfer retaining relative file paths. */
export function DesktopFolderUpload({
  workspaceId,
  hostLabel,
  onComplete,
  onBack,
}: {
  workspaceId: string;
  hostLabel: string;
  onComplete: (source: ConnectedSourceState) => void;
  onBack: () => void;
}) {
  const repository = useRepository();
  const [files, setFiles] = useState<File[]>([]);
  const [label, setLabel] = useState('');
  const [progress, setProgress] = useState({ loaded: 0, total: 0, stage: '' });
  const controller = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => controller.current?.abort(), []);
  const upload = useMutation({
    mutationFn: async () => {
      if (!files.length || files.length > 10000)
        throw new Error('Choose a folder containing between 1 and 10,000 files');
      const abort = new AbortController();
      controller.current = abort;
      const total = files.reduce((sum, file) => sum + file.size, 0);
      const manifest: { path: string; resource_id: string; revision: number }[] = [];
      let completed = 0;
      for (const file of files) {
        const path = file.webkitRelativePath || file.name;
        setProgress({ loaded: completed, total, stage: `Preparing ${path}` });
        const digest = sha256.create();
        digest.update(new TextEncoder().encode(`${path}\0${file.type}\0${file.size}\0`));
        for (let offset = 0; offset < file.size; offset += 8 * 1024 * 1024) {
          abort.signal.throwIfAborted();
          digest.update(
            new Uint8Array(await file.slice(offset, offset + 8 * 1024 * 1024).arrayBuffer()),
          );
        }
        const id = Array.from(digest.digest(), (byte) => byte.toString(16).padStart(2, '0')).join(
          '',
        );
        const uploaded = await uploadWorkspaceResources({
          workspaceId,
          repository,
          signal: abort.signal,
          files: [
            {
              type: 'file',
              file,
              filename: file.name,
              mediaType: file.type || 'application/octet-stream',
              url: '',
              clientUploadId: `folder-${id}`,
            },
          ],
          onProgress: (current) =>
            setProgress({ loaded: completed + current.loaded, total, stage: path }),
        });
        const resource = uploaded.resources[0];
        if (!resource) throw new Error(`No custody receipt was returned for ${path}`);
        manifest.push({ path, resource_id: resource.id, revision: resource.revision });
        completed += file.size;
      }
      setProgress({
        loaded: completed,
        total,
        stage: 'Verifying folder structure and publishing inputs…',
      });
      return repository.publishUploadedSource(
        workspaceId,
        label || files[0]?.webkitRelativePath.split('/')[0] || 'Desktop folder',
        manifest,
        abort.signal,
      );
    },
    onSuccess: onComplete,
  });
  return (
    <section className="space-y-4" aria-label="Upload desktop folder">
      <div className="flex items-center gap-2">
        <FolderUpIcon aria-hidden="true" className="size-5" />
        <h3 className="text-sm font-medium">Transfer a desktop folder</h3>
        <InfoTip label="About desktop folder transfers">
          Files and their folder structure are uploaded to {hostLabel}. The desktop original stays
          unchanged. Empty folders are not exposed by the browser picker. If interrupted, select the
          same folder to resume from uploaded bytes.
        </InfoTip>
      </div>
      <label className="block space-y-2 text-sm">
        Folder on your computer
        <input
          className="block w-full rounded-md border p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1"
          type="file"
          multiple
          {...{ webkitdirectory: '' }}
          disabled={upload.isPending}
          onChange={(event) => {
            const picked = Array.from(event.target.files ?? []);
            setFiles(picked);
            setLabel(picked[0]?.webkitRelativePath.split('/')[0] ?? '');
            upload.reset();
          }}
        />
      </label>
      {files.length > 0 && (
        <>
          <label className="block space-y-2 text-sm">
            Source name
            <Input
              value={label}
              disabled={upload.isPending}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <p className="text-sm text-muted-foreground">
            {files.length} files ·{' '}
            {(files.reduce((sum, file) => sum + file.size, 0) / 1024 ** 2).toFixed(1)} MB →{' '}
            {hostLabel}
          </p>
          <p className="text-xs text-muted-foreground">
            Read-only inputs. Desktop writeback is unavailable through a browser upload.
          </p>
        </>
      )}
      {upload.isPending && (
        <div role="status" className="space-y-2">
          <p className="break-all text-xs">{progress.stage}</p>
          <progress
            className="h-2 w-full accent-primary"
            aria-label="Folder upload progress"
            value={progress.loaded}
            max={progress.total || 1}
          />
        </div>
      )}
      {upload.error && (
        <p role="alert" className="text-sm text-destructive">
          {upload.error.name === 'AbortError'
            ? 'Upload paused. Already uploaded bytes are retained; transfer again to resume.'
            : upload.error.message}
        </p>
      )}
      <div className="flex justify-between gap-2">
        <Button variant="ghost" disabled={upload.isPending} onClick={onBack}>
          Back
        </Button>
        {upload.isPending ? (
          <Button variant="outline" onClick={() => controller.current?.abort()}>
            Pause upload
          </Button>
        ) : (
          <Button disabled={!files.length} onClick={() => upload.mutate()}>
            Transfer folder
          </Button>
        )}
      </div>
    </section>
  );
}
