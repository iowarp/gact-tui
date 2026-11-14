import type { ConnectedSourceState } from '@clio/core/v3';
import { sha256 } from '@noble/hashes/sha2.js';
import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CircleAlertIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRepository } from '@/hooks/use-repository';
import { uploadWorkspaceResources } from '@/lib/upload-workspace-resources';
import { InfoTip } from './info-tip';
import { RingSpinner } from './primitives/ring-spinner';
import {
  AccessRows,
  FolderFace,
  SourceField,
  SourceStatusLine,
  folderTriggerClass,
  sourceInputClass,
} from './source-form-parts';
import { useSourceFrameFooter } from './use-source-frame-footer';
import { t, plural } from '@lingui/core/macro';

/** Explicit, resumable desktop-to-connected-CLIO transfer retaining relative file paths. */
export function DesktopFolderUpload({
  workspaceId,
  hostLabel,
  onComplete,
  onBack,
  initialFiles = [],
}: {
  workspaceId: string;
  hostLabel: string;
  onComplete: (source: ConnectedSourceState) => void;
  onBack?: () => void;
  initialFiles?: File[];
}) {
  const repository = useRepository();
  const uploadId = useRef('');
  const folderInput = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>(initialFiles);
  const [label, setLabel] = useState(initialFiles[0]?.webkitRelativePath.split('/')[0] ?? '');
  const [progress, setProgress] = useState({ loaded: 0, total: 0, stage: '' });
  const controller = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => controller.current?.abort(), []);
  const upload = useMutation({
    mutationFn: async () => {
      uploadId.current ||= String(Date.now()) + Math.random().toString(36).slice(2);
      if (!files.length) throw new Error(t`Choose a folder that contains at least one file`);
      const abort = new AbortController();
      controller.current = abort;
      const total = files.reduce((sum, file) => sum + file.size, 0);
      const manifest: { path: string; resource_id: string; revision: number }[] = [];
      let completed = 0;
      for (const file of files) {
        const path = file.webkitRelativePath || file.name;
        setProgress({ loaded: completed, total, stage: t`Preparing ${path}` });
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
              clientUploadId: `folder-${uploadId.current}-${id}`,
            },
          ],
          onProgress: (current) =>
            setProgress({ loaded: completed + current.loaded, total, stage: path }),
        });
        const resource = uploaded.resources[0];
        if (!resource) throw new Error(t`No custody receipt was returned for ${path}`);
        manifest.push({ path, resource_id: resource.id, revision: resource.revision });
        completed += file.size;
      }
      setProgress({
        loaded: completed,
        total,
        stage: t`Verifying folder structure and publishing inputs…`,
      });
      return repository.publishUploadedSource(
        workspaceId,
        label || files[0]?.webkitRelativePath.split('/')[0] || t`Desktop folder`,
        manifest,
        abort.signal,
      );
    },
    onSuccess: onComplete,
  });
  const sizeMb = (files.reduce((sum, file) => sum + file.size, 0) / 1024 ** 2).toFixed(1);
  const folderName =
    files[0]?.webkitRelativePath.split('/')[0] || (files.length ? t`Selected folder` : '');
  const footer = useSourceFrameFooter({
    confirm: {
      label: upload.isPending ? t`Uploading…` : t`Upload folder`,
      disabled: !files.length || upload.isPending,
    },
    onConfirm: () => upload.mutate(),
    start: upload.isPending
      ? { label: t`Pause upload`, onClick: () => controller.current?.abort() }
      : onBack
        ? { label: t`Back`, back: true, onClick: onBack }
        : undefined,
  });
  return (
    <section className="flex flex-col gap-[13px]" aria-label={t`Upload desktop folder`}>
      <input
        ref={folderInput}
        className="hidden"
        aria-label={t`Folder on your computer`}
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
      <SourceField
        label={t`Folder on your computer`}
        aside={
          <InfoTip label={t`About desktop folder transfers`}>
            {t`Files and their folder structure are uploaded to ${hostLabel}. The desktop original stays unchanged. Empty folders are not exposed by the browser picker. If interrupted, select the same folder to resume from uploaded bytes.`}
          </InfoTip>
        }
        hint={
          files.length
            ? plural(files.length, {
                one: `# file, ${sizeMb} MB, copied to ${hostLabel}`,
                other: `# files, ${sizeMb} MB, copied to ${hostLabel}`,
              })
            : t`Copied to ${hostLabel}`
        }
      >
        <FolderFace path={folderName}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={folderTriggerClass}
            disabled={upload.isPending}
            onClick={() => folderInput.current?.click()}
          >
            {t`Choose…`}
          </Button>
        </FolderFace>
      </SourceField>
      <SourceField label={t`Name`} aside={t`Optional`}>
        <Input
          aria-label={t`Source name`}
          className={sourceInputClass}
          value={label}
          placeholder={t`The folder name`}
          disabled={upload.isPending}
          onChange={(e) => setLabel(e.target.value)}
        />
      </SourceField>
      <AccessRows
        value="read_only"
        onChange={() => undefined}
        unavailable={{
          editable: t`A browser upload cannot write back to your computer`,
          write: t`A browser upload cannot write back to your computer`,
        }}
      />
      {upload.isPending && (
        <div role="status" className="flex flex-col gap-1.5">
          <SourceStatusLine icon={<RingSpinner />}>
            {progress.stage || t`Uploading…`}
          </SourceStatusLine>
          <progress
            className="h-1 w-full accent-primary"
            aria-label={t`Folder upload progress`}
            value={progress.loaded}
            max={progress.total || 1}
          />
        </div>
      )}
      {upload.error && (
        <SourceStatusLine role="alert" tone="error" icon={<CircleAlertIcon />}>
          {upload.error.name === 'AbortError'
            ? t`Upload paused. Uploaded bytes are kept; upload again to resume.`
            : upload.error.message}
        </SourceStatusLine>
      )}
      {footer}
    </section>
  );
}
