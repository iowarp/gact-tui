import type { Artifact, WorkspaceFileEntry } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import type { BundledLanguage } from 'shiki';
import { BoxIcon, CopyIcon, FileCode2Icon, ImageIcon } from 'lucide-react';
import { useMemo } from 'react';
import {
  Artifact as ArtifactFrame,
  ArtifactAction,
  ArtifactActions,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from '@/components/ai-elements/artifact';
import {
  Attachment,
  AttachmentPreview,
  Attachments,
  type AttachmentData,
} from '@/components/ai-elements/attachments';
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@/components/ai-elements/code-block';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useRepository } from '@/hooks/use-repository';
import { useObjectUrl } from '@/hooks/use-object-url';
import { cn } from '@/lib/utils';
import { ClioCsvView } from './csv-view';
import { ArtifactProvenance } from './artifact-provenance';
import { isMissingArtifactPayload, uniqueWorkspaceArtifactFile } from './artifact-custody';
import { ClioJsonResourceView } from './json-resource-view';
import { ClioDocumentWorkspace } from './document-workspace';

const maxInlinePreviewBytes = 8_000_000;

export function WorkspaceFileView({
  workspaceId,
  path,
  size,
}: {
  workspaceId: string;
  path: string;
  size?: number;
}) {
  return isImagePath(path) ? (
    <WorkspaceImageView path={path} workspaceId={workspaceId} />
  ) : (
    <WorkspaceTextView path={path} size={size} workspaceId={workspaceId} />
  );
}

function WorkspaceTextView({
  workspaceId,
  path,
  size,
}: {
  workspaceId: string;
  path: string;
  size?: number;
}) {
  const repository = useRepository();
  const canLoad = size === undefined || size <= maxInlinePreviewBytes;
  const content = useQuery({
    queryKey: ['workspace-file', workspaceId, path],
    queryFn: ({ signal }) => repository.readWorkspaceFile(workspaceId, path, signal),
    enabled: canLoad,
  });
  if (!canLoad) return <LargeResourceNotice name={fileName(path)} size={size} />;
  return <TextResourceView content={content.data} error={content.error?.message} path={path} />;
}

function WorkspaceImageView({ workspaceId, path }: { workspaceId: string; path: string }) {
  const repository = useRepository();
  const content = useQuery({
    queryKey: ['workspace-file-bytes', workspaceId, path],
    queryFn: ({ signal }) => repository.readWorkspaceFileBytes(workspaceId, path, signal),
  });
  return (
    <ImageResourceView
      bytes={content.data}
      error={content.error?.message}
      mediaType={imageMediaType(path)}
      name={fileName(path)}
    />
  );
}

export function BlueprintFileView({
  blueprintId,
  workspaceId,
  sessionId,
  path,
}: {
  blueprintId: string;
  workspaceId: string;
  sessionId: string;
  path: string;
}) {
  const repository = useRepository();
  const content = useQuery({
    queryKey: ['blueprint-file', blueprintId, workspaceId, sessionId, path],
    queryFn: ({ signal }) =>
      repository.readAgentBlueprintFile(blueprintId, path, { workspaceId, sessionId }, signal),
  });
  return <TextResourceView content={content.data} error={content.error?.message} path={path} />;
}

export function ArtifactView({
  artifact,
  workspaceId,
  files,
}: {
  artifact: Artifact;
  workspaceId: string;
  files: readonly WorkspaceFileEntry[];
}) {
  const repository = useRepository();
  const canPreviewText = isTextArtifact(artifact.media_type, artifact.name);
  const canPreviewImage = isImageArtifact(artifact.media_type, artifact.name);
  const fallbackFile = useMemo(
    () => uniqueWorkspaceArtifactFile(artifact, workspaceId, files),
    [artifact, files, workspaceId],
  );
  const fallbackPath = fallbackFile?.path;
  const previewSize = artifact.size ?? fallbackFile?.size;
  const canLoadInline = previewSize === undefined || previewSize <= maxInlinePreviewBytes;
  const text = useQuery({
    queryKey: ['artifact-text', artifact.id, fallbackPath],
    queryFn: async ({ signal }) => {
      try {
        return await repository.readArtifactTextFor(artifact, signal);
      } catch (error) {
        if (!isMissingArtifactPayload(error) || !fallbackPath) throw error;
        return repository.readWorkspaceFile(workspaceId, fallbackPath, signal);
      }
    },
    enabled: canPreviewText && canLoadInline,
  });
  const image = useQuery({
    queryKey: ['artifact-image', artifact.id, fallbackPath],
    queryFn: async ({ signal }) => {
      try {
        return await repository.readArtifactBytesFor(artifact, signal);
      } catch (error) {
        if (!isMissingArtifactPayload(error) || !fallbackPath) throw error;
        return repository.readWorkspaceFileBytes(workspaceId, fallbackPath, signal);
      }
    },
    enabled: canPreviewImage,
  });
  const preview = canPreviewText ? (
    !canLoadInline ? (
      <LargeResourceNotice name={artifact.name} size={previewSize} />
    ) : text.data ? (
      isCsvPath(artifact.name) || artifact.media_type === 'text/csv' ? (
        <ClioCsvView content={text.data} title={artifact.name} />
      ) : isJsonPath(artifact.name) || artifact.media_type === 'application/json' ? (
        <ClioJsonResourceView content={text.data} title={artifact.name} />
      ) : (
        <CodeBlock code={text.data} language={languageForPath(artifact.name)} showLineNumbers />
      )
    ) : text.error ? (
      <ResourceUnavailable
        detail="The service remembers this result, but its saved content is no longer available. Custody and provenance remain visible below."
        label="Saved content unavailable"
      />
    ) : (
      <ResourceLoading label={`Loading ${artifact.name}`} />
    )
  ) : canPreviewImage ? (
    <ImageResourceView
      bytes={image.data}
      error={image.error?.message}
      mediaType={artifact.media_type || imageMediaType(artifact.name)}
      name={artifact.name}
    />
  ) : (
    <ResourceUnavailable
      detail="The service does not advertise an inline renderer for this media type."
      label="Preview unavailable"
    />
  );
  const previewWithRecovery = (
    <>
      {preview}
      {fallbackPath ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Historical artifact resolved through the unique workspace file {fallbackPath}.
        </p>
      ) : null}
    </>
  );

  return (
    <ScrollArea className="h-full min-w-0 p-3">
      <ArtifactFrame className="min-h-full min-w-0">
        <ArtifactHeader>
          <div className="min-w-0">
            <ArtifactTitle className="truncate">{artifact.name}</ArtifactTitle>
            <ArtifactDescription>
              {artifact.media_type}
              {artifact.size === undefined ? '' : `, ${formatBytes(artifact.size)}`}
            </ArtifactDescription>
          </div>
          <ArtifactActions>
            <ArtifactAction
              icon={CopyIcon}
              label={`Copy URI for ${artifact.name}`}
              onClick={() => void navigator.clipboard.writeText(artifact.uri)}
              tooltip="Copy artifact URI"
            />
          </ArtifactActions>
        </ArtifactHeader>
        <ArtifactContent className="min-w-0 overflow-hidden p-3">
          {isDocumentArtifact(artifact.media_type, artifact.name) ? (
            <ClioDocumentWorkspace
              artifact={artifact}
              fallbackPreview={previewWithRecovery}
              history={<ArtifactProvenance artifact={artifact} />}
              key={artifact.id}
            />
          ) : (
            <>
              {previewWithRecovery}
              <ArtifactProvenance artifact={artifact} />
            </>
          )}
          <dl className="mt-4 grid gap-2 border-t pt-4 text-xs">
            <ArtifactMetadata label="Custody" value={artifact.custody ?? 'Unavailable'} />
            <ArtifactMetadata label="Workspace" value={artifact.workspace_id ?? 'Unavailable'} />
            <ArtifactMetadata label="Checksum" mono value={artifact.sha256 ?? 'Unavailable'} />
          </dl>
        </ArtifactContent>
      </ArtifactFrame>
    </ScrollArea>
  );
}

function TextResourceView({
  path,
  content,
  error,
}: {
  path: string;
  content?: string;
  error?: string;
}) {
  if (!content && !error)
    return <ResourceLoading className="p-4" label={`Loading ${fileName(path)}`} />;
  if (error)
    return (
      <div className="p-4">
        <ResourceUnavailable detail={error} label="File preview unavailable" />
      </div>
    );
  return (
    <ScrollArea className="h-full p-3">
      {isCsvPath(path) ? (
        <ClioCsvView content={content ?? ''} title={fileName(path)} />
      ) : isJsonPath(path) ? (
        <ClioJsonResourceView content={content ?? ''} title={fileName(path)} />
      ) : (
        <CodeBlock code={content ?? ''} language={languageForPath(path)} showLineNumbers>
          <CodeBlockHeader>
            <CodeBlockTitle>
              <FileCode2Icon aria-hidden="true" className="size-4" />
              <CodeBlockFilename>{path}</CodeBlockFilename>
            </CodeBlockTitle>
            <CodeBlockActions>
              <CodeBlockCopyButton aria-label={`Copy ${fileName(path)}`} size="icon-xs" />
            </CodeBlockActions>
          </CodeBlockHeader>
        </CodeBlock>
      )}
    </ScrollArea>
  );
}

function ImageResourceView({
  bytes,
  error,
  mediaType,
  name,
}: {
  bytes?: Uint8Array;
  error?: string;
  mediaType: string;
  name: string;
}) {
  const url = useObjectUrl(bytes, mediaType);
  if (error)
    return (
      <ResourceUnavailable detail={error} icon={ImageIcon} label="Image preview unavailable" />
    );
  if (!url) return <ResourceLoading label={`Loading ${name}`} />;
  const attachment: AttachmentData = {
    type: 'file',
    id: name,
    filename: name,
    mediaType,
    url,
  };
  return (
    <Attachments className="m-0 block w-full" variant="grid">
      <Attachment
        className="min-h-72 w-full rounded-lg border bg-[linear-gradient(45deg,var(--muted)_25%,transparent_25%),linear-gradient(-45deg,var(--muted)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,var(--muted)_75%),linear-gradient(-45deg,transparent_75%,var(--muted)_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px] p-3"
        data={attachment}
      >
        <AttachmentPreview className="size-full min-h-72 bg-transparent [&_img]:max-h-[70vh] [&_img]:object-contain" />
      </Attachment>
    </Attachments>
  );
}

function ArtifactMetadata({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('min-w-0 break-all', mono && 'font-mono text-[10px]')}>{value}</dd>
    </div>
  );
}

function ResourceLoading({ label, className }: { label: string; className?: string }) {
  return (
    <div aria-label={label} className={cn('grid gap-2', className)}>
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-4/5" />
      <Skeleton className="h-8 w-11/12" />
    </div>
  );
}

function ResourceUnavailable({
  label,
  detail,
  icon: Icon = BoxIcon,
}: {
  label: string;
  detail?: string;
  icon?: typeof BoxIcon;
}) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{label}</EmptyTitle>
        {detail ? <EmptyDescription>{detail}</EmptyDescription> : null}
      </EmptyHeader>
    </Empty>
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

function languageForPath(path: string): BundledLanguage {
  const extension = path.split('.').at(-1)?.toLowerCase();
  const languages: Record<string, BundledLanguage> = {
    c: 'c',
    cpp: 'cpp',
    css: 'css',
    go: 'go',
    html: 'html',
    java: 'java',
    js: 'javascript',
    json: 'json',
    jsx: 'jsx',
    md: 'markdown',
    py: 'python',
    rs: 'rust',
    sh: 'shellscript',
    toml: 'toml',
    ts: 'typescript',
    tsx: 'tsx',
    yaml: 'yaml',
    yml: 'yaml',
  };
  return languages[extension ?? ''] ?? 'text';
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
    ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'].includes(mediaType) ||
    isImagePath(name)
  );
}

function isImagePath(path: string): boolean {
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif'].includes(
    path.split('.').at(-1)?.toLowerCase() ?? '',
  );
}

function isCsvPath(path: string): boolean {
  return path.split('.').at(-1)?.toLowerCase() === 'csv';
}

function isJsonPath(path: string): boolean {
  return path.toLowerCase().endsWith('.json');
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
      detail={`${size === undefined ? 'This file' : formatBytes(size)} exceeds the ${formatBytes(maxInlinePreviewBytes)} inline-read budget. CLIO left the source untouched; use a bounded analysis or visualization action to inspect it.`}
      icon={FileCode2Icon}
      label={`${name} is too large for an inline preview`}
    />
  );
}

function imageMediaType(path: string): string {
  const extension = path.split('.').at(-1)?.toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'avif') return 'image/avif';
  return 'image/png';
}

function formatBytes(bytes: number): string {
  if (bytes < 1_000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
}
