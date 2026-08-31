import { queryKeys } from '@/lib/query-keys';
import type { Artifact, WorkspaceFileEntry } from '@clio/core/v3';
import { brand } from '@brand';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AceEditor from 'react-ace';
import 'ace-builds/src-noconflict/mode-json';
import 'ace-builds/src-noconflict/mode-markdown';
import 'ace-builds/src-noconflict/mode-python';
import 'ace-builds/src-noconflict/mode-sh';
import 'ace-builds/src-noconflict/mode-text';
import 'ace-builds/src-noconflict/mode-toml';
import 'ace-builds/src-noconflict/mode-yaml';
import 'ace-builds/src-noconflict/theme-github';
import 'ace-builds/src-noconflict/theme-one_dark';
import type { BundledLanguage } from 'shiki';
import {
  BoxIcon,
  FileCode2Icon,
  ImageIcon,
  LocateFixedIcon,
  Maximize2Icon,
  Minimize2Icon,
  SaveIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ZoomPan } from '@/components/mermaidcn/zoom-pan';
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
    queryKey: queryKeys.key('workspace-file', workspaceId, path),
    queryFn: ({ signal }) => repository.readWorkspaceFile(workspaceId, path, signal),
    enabled: canLoad,
  });
  if (!canLoad) return <LargeResourceNotice name={fileName(path)} size={size} />;
  return <TextResourceView content={content.data} error={content.error?.message} path={path} />;
}

function WorkspaceImageView({ workspaceId, path }: { workspaceId: string; path: string }) {
  const repository = useRepository();
  const content = useQuery({
    queryKey: queryKeys.key('workspace-file-bytes', workspaceId, path),
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

/** Edits one server-owned blueprint source file with a real code editor and explicit save. */
export function BlueprintFileEditor({
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
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();
  const queryKey = ['blueprint-file', blueprintId, workspaceId, sessionId, path] as const;
  const content = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      repository.readAgentBlueprintFile(blueprintId, path, { workspaceId, sessionId }, signal),
  });
  const [draft, setDraft] = useState('');
  const [baseline, setBaseline] = useState('');
  const [loadedPath, setLoadedPath] = useState('');
  const [validation, setValidation] = useState<{ errors: string[]; warnings: string[] }>({
    errors: [],
    warnings: [],
  });
  const activeDraft = loadedPath === path ? draft : (content.data ?? '');
  const activeBaseline = loadedPath === path ? baseline : (content.data ?? '');
  const dirty = activeDraft !== activeBaseline;
  const updateDraft = (next: string) => {
    if (loadedPath !== path) {
      setLoadedPath(path);
      setBaseline(content.data ?? '');
    }
    setDraft(next);
  };

  const save = useMutation({
    mutationFn: (next: string) =>
      repository.writeAgentBlueprintFile(blueprintId, path, next, { workspaceId, sessionId }),
    onSuccess: async (result, next) => {
      queryClient.setQueryData(queryKey, next);
      setBaseline(next);
      setValidation({
        errors: result.validation_errors,
        warnings: result.validation_warnings,
      });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('blueprint-files', blueprintId, workspaceId, sessionId),
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.key('agent-blueprints') }),
      ]);
      toast.success(`Saved ${fileName(path)}`);
    },
    onError: (error) => toast.error(error.message),
  });

  if (content.error)
    return (
      <div className="p-4">
        <ResourceUnavailable detail={content.error.message} label="Blueprint source unavailable" />
      </div>
    );
  if (content.data === undefined)
    return <ResourceLoading className="p-4" label={`Loading ${fileName(path)}`} />;

  return (
    <section aria-label={`Edit ${path}`} className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <FileCode2Icon aria-hidden="true" className="size-4 text-primary" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{path}</span>
        {dirty ? (
          <Badge variant="secondary">Unsaved</Badge>
        ) : (
          <Badge variant="outline">Saved</Badge>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <AceEditor
          aria-label={`Blueprint source ${path}`}
          editorProps={{ $blockScrolling: true }}
          fontSize={13}
          height="100%"
          mode={aceModeForPath(path)}
          name={`blueprint-editor-${blueprintId}-${path}`}
          onChange={updateDraft}
          setOptions={{
            enableBasicAutocompletion: true,
            enableLiveAutocompletion: false,
            highlightActiveLine: true,
            showFoldWidgets: true,
            showPrintMargin: false,
            tabSize: 2,
            useSoftTabs: true,
            useWorker: false,
          }}
          theme={resolvedTheme === 'light' ? 'github' : 'one_dark'}
          value={activeDraft}
          width="100%"
        />
      </div>
      <div className="flex min-h-14 shrink-0 items-center gap-3 border-t px-3 py-2">
        <div aria-live="polite" className="min-w-0 flex-1 text-xs">
          {save.error ? <p className="text-destructive">{save.error.message}</p> : null}
          {validation.errors.length ? (
            <p className="truncate text-destructive">
              Saved with {validation.errors.length} validation issue
              {validation.errors.length === 1 ? '' : 's'}
            </p>
          ) : validation.warnings.length ? (
            <p className="truncate text-amber-500">
              Saved with {validation.warnings.length} warning
              {validation.warnings.length === 1 ? '' : 's'}
            </p>
          ) : (
            <p className="text-muted-foreground">
              {dirty
                ? 'Review the source, then save it to the connected service.'
                : 'Source is saved.'}
            </p>
          )}
        </div>
        <Button
          className="h-10 min-w-28 px-5"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate(activeDraft)}
        >
          <SaveIcon aria-hidden="true" />
          {save.isPending ? 'Saving' : 'Save'}
        </Button>
      </div>
    </section>
  );
}

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
  const canPreviewText = isTextArtifact(artifact.media_type, artifact.name);
  const canPreviewImage = isImageArtifact(artifact.media_type, artifact.name);
  const fallbackFile = useMemo(
    () => uniqueWorkspaceArtifactFile(artifact, workspaceId, files),
    [artifact, files, workspaceId],
  );
  const fallbackPath = fallbackFile?.path;
  const previewSize = artifact.size ?? fallbackFile?.size;
  const canLoadInline = previewSize !== undefined && previewSize <= maxInlinePreviewBytes;
  const text = useQuery({
    queryKey: queryKeys.key('artifact-text', artifact.id, fallbackPath),
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
    queryKey: queryKeys.key('artifact-image', artifact.id, fallbackPath),
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
  if (!content && !error)
    return <ResourceLoading className="p-4" label={`Loading ${fileName(path)}`} />;
  if (error)
    return (
      <div className="p-4">
        <ResourceUnavailable detail={error} label="File preview unavailable" />
      </div>
    );
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
        className="bg-[linear-gradient(45deg,var(--muted)_25%,transparent_25%),linear-gradient(-45deg,var(--muted)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,var(--muted)_75%),linear-gradient(-45deg,transparent_75%,var(--muted)_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px]"
        imageSrc={url}
        maxScale={8}
        minScale={0.05}
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

export function ResourceLoading({ label, className }: { label: string; className?: string }) {
  return (
    <div aria-label={label} className={cn('grid gap-2', className)}>
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-4/5" />
      <Skeleton className="h-8 w-11/12" />
    </div>
  );
}

export function ResourceUnavailable({
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

function aceModeForPath(path: string): string {
  const extension = path.split('.').at(-1)?.toLowerCase();
  return (
    {
      json: 'json',
      md: 'markdown',
      markdown: 'markdown',
      py: 'python',
      sh: 'sh',
      toml: 'toml',
      yaml: 'yaml',
      yml: 'yaml',
    }[extension ?? ''] ?? 'text'
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
      detail={
        size === undefined
          ? `The service did not report a size, so ${brand.name} did not download this file into the browser. Use a bounded analysis or visualization action to inspect it.`
          : `${formatBytes(size)} exceeds the ${formatBytes(maxInlinePreviewBytes)} inline-read budget. ${brand.name} left the source untouched; use a bounded analysis or visualization action to inspect it.`
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

function formatBytes(bytes: number): string {
  if (bytes < 1_000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
}
