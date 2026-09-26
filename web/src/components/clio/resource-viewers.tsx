import { queryKeys } from '@/lib/query-keys';
import type { Artifact, WorkspaceFileEntry } from '@clio/core/v3';
import { brand } from '@brand';
import { useQuery } from '@tanstack/react-query';
import {
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileIcon,
  FileCode2Icon,
  ImageIcon,
  LocateFixedIcon,
  Maximize2Icon,
  Minimize2Icon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@/components/ai-elements/code-block';
import { MessageResponse } from '@/components/ai-elements/message';
import { DOCUMENT_MARKDOWN_CLASS_NAME, normalizeConvertedMarkdown } from '@/lib/document-markdown';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ZoomPan } from '@/components/mermaidcn/zoom-pan';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useObjectUrl } from '@/hooks/use-object-url';
import { formatBytes } from '@/lib/format';
import { languageForPath } from '@/lib/code-language';
import { isTextMediaType } from '@/lib/media-types';
import { INLINE_PREVIEW_MAX_BYTES } from '@/lib/runtime-limits';
import { cn } from '@/lib/utils';
import { ClioCsvView } from './csv-view';
import { ArtifactProvenance } from './artifact-provenance';
import { isMissingArtifactPayload, uniqueWorkspaceArtifactFile } from './artifact-custody';
import { ClioJsonResourceView } from './json-resource-view';
import { ClioDocumentWorkspace } from './document-workspace';
import { MarkdownFilePreview } from './markdown-file-preview';
import { ClioPdfPreview } from './pdf-preview';
import { ResourceLoading, ResourceUnavailable } from './resource-states';

export function WorkspaceFileView({
  workspaceId,
  path,
  size,
  mediaType,
  initialPage,
}: {
  workspaceId: string;
  path: string;
  size?: number;
  mediaType?: string;
  /** PDF only: the page to open on, when the caller already knows which page
   * matters (e.g. the page range an agent's view_pdf call actually viewed). */
  initialPage?: number;
}) {
  const detected = mediaType || inferredWorkspaceMediaType(path);
  if (detected === 'application/pdf') {
    return <WorkspacePdfView initialPage={initialPage} path={path} workspaceId={workspaceId} />;
  }
  if (detected.startsWith('image/')) {
    return <WorkspaceImageView mediaType={detected} path={path} workspaceId={workspaceId} />;
  }
  if (isTextMediaType(detected)) {
    return <WorkspaceTextView path={path} size={size} workspaceId={workspaceId} />;
  }
  return (
    <WorkspaceBinaryView mediaType={detected} path={path} size={size} workspaceId={workspaceId} />
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
    <div className="size-full overflow-hidden p-3">
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
}: {
  workspaceId: string;
  path: string;
  size?: number;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const canLoad = size === undefined || size <= INLINE_PREVIEW_MAX_BYTES;
  const content = useQuery({
    queryKey: queryKeys.workspaceFile(settings.endpoint, workspaceId, path),
    queryFn: ({ signal }) => repository.readWorkspaceFile(workspaceId, path, signal),
    enabled: canLoad,
  });
  if (!canLoad) return <LargeResourceNotice name={fileName(path)} size={size} />;
  return <TextResourceView content={content.data} error={content.error?.message} path={path} />;
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
  const [busy, setBusy] = useState<'download' | 'open'>();

  const load = async (mode: 'download' | 'open') => {
    setBusy(mode);
    try {
      const bytes = await repository.readWorkspaceFileBytes(workspaceId, path);
      const url = URL.createObjectURL(
        new Blob([Uint8Array.from(bytes).buffer], { type: mediaType }),
      );
      if (mode === 'open') {
        window.open(url, '_blank', 'noopener,noreferrer');
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName(path);
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not ${mode} ${fileName(path)}`);
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <div className="grid h-full place-items-center p-6">
      <Empty className="max-w-lg border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{fileName(path)}</EmptyTitle>
          <EmptyDescription>
            {mediaType} · {size === undefined ? 'Size unavailable' : formatBytes(size)}
          </EmptyDescription>
          <p className="break-all font-mono text-xs text-muted-foreground">{path}</p>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <Button disabled={Boolean(busy)} onClick={() => void load('open')} size="sm">
              <ExternalLinkIcon aria-hidden="true" />
              {busy === 'open' ? 'Opening…' : 'Open'}
            </Button>
            <Button
              disabled={Boolean(busy)}
              onClick={() => void load('download')}
              size="sm"
              variant="outline"
            >
              <DownloadIcon aria-hidden="true" />
              {busy === 'download' ? 'Downloading…' : 'Download'}
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

export { BlueprintFileEditor } from './blueprint-file-editor';

export function ArtifactView({
  artifact,
  workspaceId,
  files,
  onOpenArtifact,
}: {
  artifact: Artifact;
  workspaceId: string;
  files: readonly WorkspaceFileEntry[];
  onOpenArtifact?: (artifact: Artifact) => void;
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
        return await repository.readArtifactTextFor(artifact, signal);
      } catch (error) {
        if (!isMissingArtifactPayload(error) || !fallbackPath) throw error;
        return repository.readWorkspaceFile(workspaceId, fallbackPath, signal);
      }
    },
    enabled: canPreviewText && canLoadInline,
  });
  const image = useQuery({
    queryKey: queryKeys.key('artifact-image', settings.endpoint, artifact.id, fallbackPath),
    queryFn: async ({ signal }) => {
      try {
        return await repository.readArtifactBytesFor(artifact, signal);
      } catch (error) {
        if (!isMissingArtifactPayload(error) || !fallbackPath) throw error;
        return repository.readWorkspaceFileBytes(workspaceId, fallbackPath, signal);
      }
    },
    enabled: canPreviewImage && canLoadInline,
  });
  const preview = canPreviewText ? (
    !canLoadInline ? (
      <LargeResourceNotice name={artifact.name} size={previewSize} />
    ) : text.data ? (
      isMarkdownArtifact(artifact.media_type, artifact.name) ? (
        <article className="min-w-0 overflow-hidden rounded-lg border bg-background px-5 py-4">
          <MessageResponse className={DOCUMENT_MARKDOWN_CLASS_NAME}>
            {normalizeConvertedMarkdown(text.data)}
          </MessageResponse>
        </article>
      ) : isCsvPath(artifact.name) || artifact.media_type === 'text/csv' ? (
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
    canLoadInline ? (
      <ImageResourceView
        bytes={image.data}
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
    <Tabs className="h-full min-w-0 gap-0" defaultValue="preview">
      <div className="border-b px-3 py-2">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="versions">Versions</TabsTrigger>
          <TabsTrigger value="lineage">Lineage</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent className="m-0 min-h-0 overflow-hidden" value="preview">
        <ScrollArea className="h-full min-w-0 p-3">
          {isDocumentArtifact(artifact.media_type, artifact.name) ? (
            <ClioDocumentWorkspace
              artifact={artifact}
              fallbackPreview={preview}
              key={artifact.id}
            />
          ) : (
            preview
          )}
          {fallbackPath ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Recovered from the matching workspace file.
            </p>
          ) : null}
        </ScrollArea>
      </TabsContent>
      <TabsContent className="m-0 min-h-0 overflow-hidden" value="versions">
        <ScrollArea className="h-full min-w-0 p-3">
          <ArtifactProvenance artifact={artifact} view="versions" />
        </ScrollArea>
      </TabsContent>
      <TabsContent className="m-0 min-h-0 overflow-hidden" value="lineage">
        <ScrollArea className="h-full min-w-0 p-3">
          <ArtifactProvenance artifact={artifact} onOpenArtifact={onOpenArtifact} view="lineage" />
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );
}

export function TextResourceView({
  path,
  content,
  error,
}: {
  path: string;
  content?: string;
  error?: string;
}) {
  if (content === undefined && !error)
    return <ResourceLoading className="p-4" label={`Loading ${fileName(path)}`} />;
  if (error)
    return (
      <div className="p-4">
        <ResourceUnavailable detail={error} label="File preview unavailable" />
      </div>
    );
  if (isMarkdownArtifact('', path)) {
    return <MarkdownFilePreview name={fileName(path)} content={content ?? ''} />;
  }
  if (isCsvPath(path) || isJsonPath(path)) {
    return (
      <ScrollArea className="h-full p-3">
        {isCsvPath(path) ? (
          <ClioCsvView content={content ?? ''} title={fileName(path)} />
        ) : (
          <ClioJsonResourceView content={content ?? ''} title={fileName(path)} />
        )}
      </ScrollArea>
    );
  }
  return (
    <div className="h-full min-w-0 p-3">
      <CodeBlock
        className="h-full min-w-0"
        code={content ?? ''}
        language={languageForPath(path)}
        showLineNumbers
      >
        <CodeBlockHeader>
          <CodeBlockTitle>
            <FileCode2Icon aria-hidden="true" className="size-4 shrink-0" />
            <CodeBlockFilename>{path}</CodeBlockFilename>
          </CodeBlockTitle>
          <CodeBlockActions>
            <CodeBlockCopyButton aria-label={`Copy ${fileName(path)}`} size="icon-xs" />
          </CodeBlockActions>
        </CodeBlockHeader>
      </CodeBlock>
    </div>
  );
}

export function ImageResourceView({
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
  const hostRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === hostRef.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  if (error)
    return (
      <ResourceUnavailable detail={error} icon={ImageIcon} label="Image preview unavailable" />
    );
  if (!url) return <ResourceLoading label={`Loading ${name}`} />;
  return (
    <div
      className={cn(
        'h-full min-h-[22rem] overflow-hidden bg-background',
        fullscreen && 'h-screen min-h-0',
      )}
      ref={hostRef}
    >
      <ZoomPan
        ariaLabel={`Zoomable image ${name}`}
        className="bg-muted/30"
        fitPadding={1}
        imageSrc={url}
        maxScale={8}
        minScale={0.05}
        viewportClassName="bg-[linear-gradient(45deg,var(--muted)_25%,transparent_25%),linear-gradient(-45deg,var(--muted)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,var(--muted)_75%),linear-gradient(-45deg,transparent_75%,var(--muted)_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px]"
        viewportMode="image-aspect"
        zoomStep={0.2}
        controls={({ zoomIn, zoomOut, resetZoom, centerView, scalePercent }) => (
          <div className="flex min-h-10 items-center gap-1 border-b bg-background/90 px-2 backdrop-blur-sm">
            <span className="mr-auto hidden text-xs text-muted-foreground sm:inline">
              Scroll to zoom, drag to pan
            </span>
            <Button aria-label="Zoom out" onClick={zoomOut} size="icon-sm" variant="ghost">
              <ZoomOutIcon aria-hidden="true" />
            </Button>
            <button
              aria-label="Reset image zoom"
              className="min-w-12 rounded-md px-1 text-center text-[11px] font-medium tabular-nums text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              onClick={resetZoom}
              title="Reset image zoom"
              type="button"
            >
              {scalePercent}%
            </button>
            <Button aria-label="Zoom in" onClick={zoomIn} size="icon-sm" variant="ghost">
              <ZoomInIcon aria-hidden="true" />
            </Button>
            <Button
              aria-label="Fit image to view"
              onClick={centerView}
              size="icon-sm"
              title="Fit image to view"
              variant="ghost"
            >
              <LocateFixedIcon aria-hidden="true" />
            </Button>
            <Button
              aria-label={fullscreen ? 'Exit image fullscreen' : 'View image fullscreen'}
              onClick={() => {
                if (fullscreen) void document.exitFullscreen();
                else void hostRef.current?.requestFullscreen();
              }}
              size="icon-sm"
              variant="ghost"
            >
              {fullscreen ? (
                <Minimize2Icon aria-hidden="true" />
              ) : (
                <Maximize2Icon aria-hidden="true" />
              )}
            </Button>
          </div>
        )}
      />
    </div>
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

function isCsvPath(path: string): boolean {
  return path.split('.').at(-1)?.toLowerCase() === 'csv';
}

function isJsonPath(path: string): boolean {
  return path.toLowerCase().endsWith('.json');
}

function isMarkdownArtifact(mediaType: string, name: string): boolean {
  return (
    ['text/markdown', 'text/x-markdown'].includes(mediaType) ||
    ['md', 'markdown'].includes(name.split('.').at(-1)?.toLowerCase() ?? '')
  );
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
