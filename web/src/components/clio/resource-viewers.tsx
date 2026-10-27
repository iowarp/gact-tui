import { queryKeys } from '@/lib/query-keys';
import type { Artifact, WorkspaceFileEntry } from '@clio/core/v3';
import { brand } from '@brand';
import { useQuery } from '@tanstack/react-query';
import {
  CopyIcon,
  ExternalLinkIcon,
  EyeIcon,
  HistoryIcon,
  GitBranchIcon,
  FileCode2Icon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { FileTextView } from './file-text-view';
import { textFileFormat } from '@/lib/file-presentation';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { formatBytes } from '@/lib/format';
import { isTextMediaType } from '@/lib/media-types';
import { INLINE_PREVIEW_MAX_BYTES } from '@/lib/runtime-limits';

import { ArtifactProvenance } from './artifact-provenance';
import {
  ArtifactRecoveryError,
  isMissingArtifactPayload,
  uniqueWorkspaceArtifactFile,
  verifyArtifactRecovery,
} from './artifact-custody';

import { ClioDocumentWorkspace } from './document-workspace';

import { isHtmlFile } from './html-preview-policy';
import { FileReadView } from './file-text-view';
import { ClioPdfPreview } from './pdf-preview';
import { ResourceLoading, ResourceUnavailable } from './resource-states';
import { FileViewerShell } from './file-viewer-shell';

import { ImageResourceView } from './image-resource-view';
import { DashboardResourceView } from './dashboard-view';
export { ImageResourceView } from './image-resource-view';

export function WorkspaceFileView({
  workspaceId,
  path,
  size,
  mediaType,
  initialPage,
  embedded = false,
}: {
  workspaceId: string;
  path: string;
  size?: number;
  mediaType?: string;
  /** PDF only: the page to open on, when the caller already knows which page
   * matters (e.g. the page range an agent's view_pdf call actually viewed). */
  initialPage?: number;
  /** The enclosing tool-result card already owns the file identity. */
  embedded?: boolean;
}) {
  const detected = mediaType || inferredWorkspaceMediaType(path);
  const html =
    detected !== 'application/pdf' && !detected.startsWith('image/') && isHtmlFile(path, detected);
  const preview =
    detected === 'application/pdf' ? (
      <WorkspacePdfView initialPage={initialPage} path={path} workspaceId={workspaceId} />
    ) : detected.startsWith('image/') ? (
      <WorkspaceImageView mediaType={detected} path={path} workspaceId={workspaceId} />
    ) : isTextMediaType(detected) || html ? (
      <WorkspaceTextView path={path} size={size} workspaceId={workspaceId} mediaType={detected} />
    ) : (
      <WorkspaceBinaryView mediaType={detected} path={path} size={size} workspaceId={workspaceId} />
    );
  return (
    <FileViewerShell
      source={{ kind: 'workspace', workspaceId, path, mediaType: detected, size }}
      showIdentity={!embedded}
      tabs={[{ value: 'preview', label: 'Preview', icon: EyeIcon, content: preview }]}
    />
  );
}

function WorkspacePdfView({
  workspaceId,
  path,
  initialPage,
}: {
  workspaceId: string;
  path: string;
  initialPage?: number;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const content = useQuery({
    queryKey: queryKeys.workspaceFileBytes(settings.endpoint, workspaceId, path),
    queryFn: ({ signal }) => repository.readWorkspaceFileBytes(workspaceId, path, signal),
  });
  return (
    <div className="size-full overflow-hidden">
      <ClioPdfPreview
        bytes={content.data}
        error={content.error?.message}
        initialPage={initialPage}
        name={fileName(path)}
      />
    </div>
  );
}

function WorkspaceTextView({
  workspaceId,
  path,
  size,
  mediaType,
  htmlView,
}: {
  workspaceId: string;
  path: string;
  size?: number;
  mediaType?: string;
  htmlView?: 'preview' | 'source';
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const canLoad = size === undefined || size <= INLINE_PREVIEW_MAX_BYTES;
  const content = useQuery({
    queryKey: queryKeys.workspaceFile(settings.endpoint, workspaceId, path),
    queryFn: ({ signal }) => repository.readWorkspaceFile(workspaceId, path, signal),
    enabled: canLoad,
    // Preview and Source are two views of the same loaded file. Switching
    // between their host tabs must not restart a read of unchanged content.
    refetchOnMount: htmlView ? false : undefined,
  });
  if (!canLoad) return <LargeResourceNotice name={fileName(path)} size={size} />;
  return (
    <TextResourceView
      content={content.data}
      error={content.error?.message}
      path={path}
      mediaType={mediaType}
      htmlView={htmlView}
    />
  );
}

function WorkspaceImageView({
  workspaceId,
  path,
  mediaType,
}: {
  workspaceId: string;
  path: string;
  mediaType: string;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const content = useQuery({
    queryKey: queryKeys.workspaceFileBytes(settings.endpoint, workspaceId, path),
    queryFn: ({ signal }) => repository.readWorkspaceFileBytes(workspaceId, path, signal),
  });
  return (
    <ImageResourceView
      bytes={content.data}
      error={content.error?.message}
      mediaType={mediaType}
      name={fileName(path)}
    />
  );
}

function WorkspaceBinaryView({
  workspaceId,
  path,
  mediaType,
  size,
}: {
  workspaceId: string;
  path: string;
  mediaType: string;
  size?: number;
}) {
  const repository = useRepository();
  const [busy, setBusy] = useState(false);

  const open = async () => {
    setBusy(true);
    try {
      const bytes = await repository.readWorkspaceFileBytes(workspaceId, path);
      const url = URL.createObjectURL(
        new Blob([Uint8Array.from(bytes).buffer], { type: mediaType }),
      );
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not open ${fileName(path)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid h-full place-items-center p-6">
      <Empty className="max-w-lg">
        <EmptyHeader>
          <EmptyTitle>No inline preview</EmptyTitle>
          <EmptyDescription>
            {mediaType}, {size === undefined ? 'Size unavailable' : formatBytes(size)}
          </EmptyDescription>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <Button disabled={busy} onClick={() => void open()} size="sm">
              <ExternalLinkIcon aria-hidden="true" />
              {busy ? 'Opening…' : 'Open'}
            </Button>
            <Button
              onClick={() => void navigator.clipboard.writeText(path)}
              size="sm"
              variant="outline"
            >
              <CopyIcon aria-hidden="true" /> Copy path
            </Button>
          </div>
        </EmptyHeader>
      </Empty>
    </div>
  );
}

export function ArtifactView({
  artifact,
  workspaceId,
  files,
  onOpenArtifact,
  onOpenWorkspaceFile,
}: {
  artifact: Artifact;
  workspaceId: string;
  files: readonly WorkspaceFileEntry[];
  onOpenArtifact?: (artifact: Artifact) => void;
  onOpenWorkspaceFile?: (path: string) => void;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const canPreviewText = isTextArtifact(artifact.media_type, artifact.name);
  const canPreviewImage = isImageArtifact(artifact.media_type, artifact.name);
  const fallbackFile = useMemo(
    () => uniqueWorkspaceArtifactFile(artifact, workspaceId, files),
    [artifact, files, workspaceId],
  );
  const fallbackPath = fallbackFile?.path;
  const previewSize = artifact.size ?? fallbackFile?.size;
  const canLoadInline = previewSize !== undefined && previewSize <= INLINE_PREVIEW_MAX_BYTES;
  const text = useQuery({
    queryKey: queryKeys.key('artifact-text', settings.endpoint, artifact.id, fallbackPath),
    queryFn: async ({ signal }) => {
      try {
        return {
          content: await repository.readArtifactTextFor(artifact, signal),
          recovered: false,
        };
      } catch (error) {
        if (!isMissingArtifactPayload(error)) throw error;
        const recoveredPath =
          fallbackPath ??
          uniqueWorkspaceArtifactFile(
            artifact,
            workspaceId,
            (await repository.workspaceFiles(workspaceId, signal, { excludeServiceStorage: true }))
              .entries,
          )?.path;
        if (!recoveredPath) throw error;
        const bytes = await repository.readWorkspaceFileBytes(workspaceId, recoveredPath, signal);
        await verifyArtifactRecovery(artifact, bytes, recoveredPath);
        return {
          content: new TextDecoder('utf-8', { ignoreBOM: true, fatal: true }).decode(bytes),
          recovered: true,
          recoveredPath,
        };
      }
    },
    enabled: canPreviewText && canLoadInline,
  });
  const image = useQuery({
    queryKey: queryKeys.key('artifact-image', settings.endpoint, artifact.id, fallbackPath),
    queryFn: async ({ signal }) => {
      try {
        return { bytes: await repository.readArtifactBytesFor(artifact, signal), recovered: false };
      } catch (error) {
        if (!isMissingArtifactPayload(error)) throw error;
        const recoveredPath =
          fallbackPath ??
          uniqueWorkspaceArtifactFile(
            artifact,
            workspaceId,
            (await repository.workspaceFiles(workspaceId, signal, { excludeServiceStorage: true }))
              .entries,
          )?.path;
        if (!recoveredPath) throw error;
        const bytes = await repository.readWorkspaceFileBytes(workspaceId, recoveredPath, signal);
        await verifyArtifactRecovery(artifact, bytes, recoveredPath);
        return {
          bytes,
          recovered: true,
          recoveredPath,
        };
      }
    },
    enabled: canPreviewImage && canLoadInline,
  });
  const payloadError = text.error ?? image.error;
  const currentFile =
    payloadError instanceof ArtifactRecoveryError ? payloadError.workspacePath : fallbackPath;
  const currentFileAction =
    payloadError && currentFile && onOpenWorkspaceFile ? (
      <Button
        className="m-4 w-fit"
        variant="outline"
        onClick={() => onOpenWorkspaceFile(currentFile)}
      >
        Open current workspace file
      </Button>
    ) : null;
  const preview = canPreviewText ? (
    !canLoadInline ? (
      <LargeResourceNotice name={artifact.name} size={previewSize} />
    ) : text.data ? (
      artifact.producer?.['designation'] === 'dashboard-report' ||
      artifact.name.endsWith('.dashboard.json') ? (
        <DashboardResourceView content={text.data.content} artifactId={artifact.id} />
      ) : isHtmlFile(artifact.name, artifact.media_type) ? (
        <FileReadView name={artifact.name} content={text.data.content} format="html" />
      ) : isMarkdownArtifact(artifact.media_type, artifact.name) ? (
        <FileReadView name={artifact.name} content={text.data.content} format="markdown" />
      ) : (
        <FileTextView
          name={artifact.name}
          content={text.data.content}
          mediaType={artifact.media_type}
        />
      )
    ) : text.error ? (
      <ResourceUnavailable
        detail={
          text.error instanceof ArtifactRecoveryError
            ? text.error.message
            : 'The service remembers this result, but its saved content is no longer available. Custody and provenance remain visible below.'
        }
        label="Saved content unavailable"
      />
    ) : (
      <ResourceLoading label={`Loading ${artifact.name}`} />
    )
  ) : canPreviewImage ? (
    canLoadInline ? (
      <ImageResourceView
        bytes={image.data?.bytes}
        error={image.error?.message}
        mediaType={artifact.media_type || imageMediaType(artifact.name)}
        name={artifact.name}
      />
    ) : (
      <LargeResourceNotice name={artifact.name} size={previewSize} />
    )
  ) : (
    <ResourceUnavailable
      detail="The service does not advertise an inline renderer for this media type."
      label="Preview unavailable"
    />
  );
  return (
    <FileViewerShell
      source={{
        kind: 'artifact',
        artifact,
        workspaceId,
        verifiedWorkspacePath: text.data?.recovered
          ? text.data.recoveredPath
          : image.data?.recovered
            ? image.data.recoveredPath
            : undefined,
        unavailable:
          payloadError instanceof ArtifactRecoveryError || isMissingArtifactPayload(payloadError),
      }}
      hasDocumentActions={
        !canPreviewImage && isDocumentArtifact(artifact.media_type, artifact.name)
      }
      label="Artifact views"
      tabs={[
        {
          value: 'preview',
          label: 'Preview',
          icon: EyeIcon,
          content: (
            <>
              {currentFileAction}
              {canPreviewImage ? (
                <div className="flex h-full min-h-0 flex-col gap-2">
                  <div className="min-h-0 flex-1">{preview}</div>
                  {image.data?.recovered ? (
                    <p className="shrink-0 text-xs text-muted-foreground">
                      Recovered from the matching workspace file.
                    </p>
                  ) : null}
                </div>
              ) : isDocumentArtifact(artifact.media_type, artifact.name) ? (
                <ClioDocumentWorkspace
                  artifact={artifact}
                  fallbackPreview={preview}
                  fallbackSource={text.data?.content}
                  key={artifact.id}
                />
              ) : (
                <div className="flex h-full min-h-0 min-w-0 flex-col">
                  <div className="min-h-0 flex-1">{preview}</div>
                  {text.data?.recovered ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Recovered from the matching workspace file.
                    </p>
                  ) : null}
                </div>
              )}
            </>
          ),
        },
        {
          value: 'versions',
          secondary: true,
          label: 'Versions',
          icon: HistoryIcon,
          content: (
            <ScrollArea className="h-full min-w-0 p-3">
              <ArtifactProvenance artifact={artifact} view="versions" />
            </ScrollArea>
          ),
        },
        {
          value: 'lineage',
          label: 'Lineage',
          icon: GitBranchIcon,
          content: (
            <ScrollArea className="h-full min-w-0 p-3">
              <ArtifactProvenance
                artifact={artifact}
                onOpenArtifact={onOpenArtifact}
                view="lineage"
              />
            </ScrollArea>
          ),
        },
      ]}
    />
  );
}

export function TextResourceView({
  path,
  content,
  error,
  mediaType,
  htmlView,
}: {
  path: string;
  content?: string;
  error?: string;
  mediaType?: string;
  htmlView?: 'preview' | 'source';
}) {
  if (content === undefined && !error)
    return <ResourceLoading className="p-4" label={`Loading ${fileName(path)}`} />;
  if (error)
    return (
      <div className="p-4">
        <ResourceUnavailable detail={error} label="File preview unavailable" />
      </div>
    );
  return (
    <FileTextView
      name={fileName(path)}
      content={content ?? ''}
      mediaType={mediaType}
      view={htmlView}
    />
  );
}
function fileName(path: string): string {
  return (
    path
      .split(/[\\/]+/)
      .filter(Boolean)
      .at(-1) ?? path
  );
}

function isTextArtifact(mediaType: string, name: string): boolean {
  return (
    mediaType.startsWith('text/') ||
    ['application/json', 'application/yaml', 'application/x-yaml'].includes(mediaType) ||
    [
      'c',
      'cpp',
      'css',
      'csv',
      'go',
      'html',
      'htm',
      'java',
      'js',
      'json',
      'jsx',
      'md',
      'py',
      'rs',
      'sh',
      'toml',
      'ts',
      'tsx',
      'txt',
      'yaml',
      'yml',
    ].includes(name.split('.').at(-1)?.toLowerCase() ?? '')
  );
}

function isImageArtifact(mediaType: string, name: string): boolean {
  return (
    ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/svg+xml'].includes(
      mediaType,
    ) || isImagePath(name)
  );
}

function isImagePath(path: string): boolean {
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg'].includes(
    path.split('.').at(-1)?.toLowerCase() ?? '',
  );
}

function isMarkdownArtifact(mediaType: string, name: string): boolean {
  return textFileFormat(name, mediaType) === 'markdown';
}

function isDocumentArtifact(mediaType: string, name: string): boolean {
  if (
    [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.oasis.opendocument.text',
      'application/vnd.oasis.opendocument.spreadsheet',
      'application/vnd.oasis.opendocument.presentation',
    ].includes(mediaType)
  ) {
    return true;
  }
  return [
    'md',
    'markdown',
    'pdf',
    'tex',
    'html',
    'htm',
    'docx',
    'xlsx',
    'pptx',
    'odt',
    'ods',
    'odp',
  ].includes(name.split('.').at(-1)?.toLowerCase() ?? '');
}

function LargeResourceNotice({ name, size }: { name: string; size?: number }) {
  return (
    <ResourceUnavailable
      detail={
        size === undefined
          ? `The service did not report a size, so ${brand.name} did not download this file into the browser. Use a bounded analysis or visualization action to inspect it.`
          : `${formatBytes(size)} exceeds the ${formatBytes(INLINE_PREVIEW_MAX_BYTES)} inline-read budget. ${brand.name} left the source untouched; use a bounded analysis or visualization action to inspect it.`
      }
      icon={FileCode2Icon}
      label={
        size === undefined
          ? `${name} has no verified preview size`
          : `${name} is too large for an inline preview`
      }
    />
  );
}

function imageMediaType(path: string): string {
  const extension = path.split('.').at(-1)?.toLowerCase();
  if (extension === 'svg') return 'image/svg+xml';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'avif') return 'image/avif';
  return 'image/png';
}

function inferredWorkspaceMediaType(path: string): string {
  const extension = path.split('.').at(-1)?.toLowerCase();
  if (extension === 'pdf') return 'application/pdf';
  if (isImagePath(path)) return imageMediaType(path);
  if (extension === 'json') return 'application/json';
  if (extension === 'xml') return 'application/xml';
  if (isTextArtifact('', path)) return 'text/plain';
  return 'application/octet-stream';
}
