import { queryKeys } from '@/lib/query-keys';
import { VIEWER_BYTES_GC_TIME_MS } from '@/lib/runtime-limits';
import { renderedFileText, textFileFormat } from '@/lib/file-presentation';
import type { Artifact, DocumentManifest, DocumentWorkingCopy } from '@clio/core/v3';
import { TransportError } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessagesSquareIcon } from 'lucide-react';
import { useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { CommentCapture, CommentToggle } from './comments/comment-capture';
import type { CommentSurface } from './comments/comment-model';
import {
  CommentSessionProvider,
  commentThreadsKey,
  useCommentSession,
} from './comments/comment-session';
import { DocumentRefreshAction } from './document-refresh-action';
import { CommentThreadList } from './comments/comment-thread-list';
import { useInFrameComments } from './comments/frame-comments-slot';
import { pdfRegionAnchor } from './comments/region-anchors';
import { HtmlFileInBrowser } from './html-in-browser';
import { LatexWorkspace } from './latex-workspace';
import { isScientificDocument } from '@/lib/scientific-document';
import { artifactDisplayName } from '@/lib/dashboard-presentation';
import { CodeBlock } from '@/components/ai-elements/code-block';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { revealFileBytes } from '@/tauri/documents';
import { DocumentViewControls } from './document-view-controls';
import { useDocumentOpenActions, type DocumentOpenTarget } from './document-open-menu';
import { openDocumentTarget } from './document-launch';
import { isDocumentSourceProfile } from './document-open-policy';
import { documentPdfFileName, prepareDocumentPdf } from './document-pdf';
import { DocumentSourceView } from './document-source-view';
import { WorkingCopyState } from './document-working-copy';
import { type FileViewerAction, useFileViewerActions } from './file-viewer-action-context';
import { FileViewerInformationHost } from './file-viewer-context';
import { useFileViewerFacts } from './file-viewer-facts';
import { FileViewerInformation } from './file-viewer-information';
import { FrameDownloadButton, FrameOpenButton } from './file-viewer-take';
import { useOpenTake } from './file-viewer-take-hooks';
import { FileReadView } from './file-text-view';
import { ClioPdfPreview } from './pdf-preview';
import { FrameBar, FrameCrumbs } from './primitives/frame-bar';
import { StateView } from './primitives/state-view';
import { ResourceLoading, ResourceUnavailable } from './resource-states';
import { downloadBytes } from './surface-export';
import { TextFileCopyAction } from './text-file-copy-action';
import { ToolbarAction, ViewerToolbarContent } from './viewer-toolbar';
import { ViewerToolbarHost } from './viewer-toolbar-context';

const directProfiles = new Set(['markdown', 'pdf', 'latex', 'html-static']);

/**
 * A document under the frame bar: its modes in Format, Comments in the
 * frame's place and its apps, working copy and PDF in the frame's Open ▾; the
 * body is only the document. On its own (a document outside a file viewer) it
 * keeps one row with the same controls, Copy and an Open ▾.
 */
export function ClioDocumentWorkspace({
  artifact,
  fallbackPreview,
  fallbackSource,
  unavailablePreview,
}: {
  artifact: Artifact;
  fallbackPreview: ReactNode;
  fallbackSource?: string;
  /** Shown instead of the PDF preview when the server has no document runtime to make it. */
  unavailablePreview?: ReactNode;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const queryClient = useQueryClient();
  const framed = useContext(FileViewerInformationHost) !== undefined;
  const inFrameComments = useInFrameComments();
  const outerHost = useContext(ViewerToolbarHost);
  const [localHost, setLocalHost] = useState<HTMLDivElement | null>(null);
  const ownRow = !framed && !outerHost;
  const toolbarHost = ownRow ? localHost : outerHost;
  const previewRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('');
  const [documentView, setDocumentView] = useState('preview');
  const [workingCopy, setWorkingCopy] = useState<DocumentWorkingCopy>();
  const manifest = useQuery({
    queryKey: queryKeys.key('document-manifest', settings.endpoint, artifact.id),
    queryFn: ({ signal }) => repository.documentManifest(artifact.id, signal),
  });
  const needsPdfPreview = Boolean(
    manifest.data &&
      !directProfiles.has(manifest.data.profile) &&
      (manifest.data.pdf_rendition_artifact_id || manifest.data.rendition_formats.includes('pdf')),
  );
  // One immutable rendition is shared by preview, PDF export and native PDF opening.
  // Do not abort conversion when a tab unmounts: reopening joins the same request.
  const pdfOptions = {
    queryKey: queryKeys.key('document-pdf', settings.endpoint, artifact.id),
    queryFn: () => prepareDocumentPdf(repository, manifest.data, artifact.session_id),
    staleTime: Infinity,
    retry: false as const,
  };
  const pdfPreview = useQuery({
    ...pdfOptions,
    enabled: needsPdfPreview,
    retryOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const effectiveManifest = (needsPdfPreview ? pdfPreview.data : undefined) ?? manifest.data;
  // Without the document runtime (LibreOffice) there is no PDF to show or export: the
  // file reads as any file with no viewer, and Export to PDF says why it is off.
  const runtimeMissing = renditionUnavailable(pdfPreview.error);
  const commentSurface = useMemo<CommentSurface>(
    () => documentCommentSurface(artifact, effectiveManifest, manifest.data),
    [artifact, effectiveManifest, manifest.data],
  );
  const content = useQuery({
    queryKey: queryKeys.key('document-content', settings.endpoint, effectiveManifest?.artifact_id),
    queryFn: ({ signal }) => repository.documentContent(effectiveManifest!.artifact_id, signal),
    enabled: Boolean(effectiveManifest && directProfiles.has(effectiveManifest.profile)),
    gcTime: VIEWER_BYTES_GC_TIME_MS,
  });

  const announce = (message: string) => {
    setStatus(message);
    toast.success(message);
  };
  const preparePdf = () => queryClient.fetchQuery(pdfOptions);
  const rendition = useMutation({
    mutationFn: async () => {
      const pdf = await preparePdf();
      const bytes = await repository.documentContent(pdf.artifact_id);
      downloadBytes(bytes, 'application/pdf', documentPdfFileName(artifact.name));
    },
    onSuccess: () => setStatus('PDF downloaded.'),
  });
  const createWorkingCopy = useMutation({
    mutationFn: (target: DocumentOpenTarget) =>
      openDocumentTarget(repository, manifest.data, artifact.session_id, preparePdf, target),
    onSuccess: (result) => {
      setWorkingCopy(result.desktopCopy ? undefined : result.copy);
      announce(
        `${result.isPdf ? 'PDF' : artifact.name} opened in ${result.appName}.${
          result.desktopCopy
            ? ' Opened a desktop copy; edits are local to this copy.'
            : result.copy?.auto_checkpoint
              ? ' Stable saves become immutable revisions.'
              : ''
        }`,
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const closeWorkingCopy = useMutation({
    mutationFn: () => repository.closeDocumentWorkingCopy(workingCopy!.id),
    onSuccess: (copy) => {
      setWorkingCopy(copy);
      announce('Working copy closed. Its saved revisions remain.');
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const revealSource = useMutation({
    mutationFn: async () =>
      revealFileBytes(
        artifact.name.split(/[\\/]/u).at(-1)!,
        await repository.documentContent(artifact.id),
      ),
    onSuccess: () => announce('Desktop copy shown in its folder.'),
    onError: (error: Error) => toast.error(error.message),
  });
  const resolveConflict = useMutation({
    mutationFn: (resolution: 'keep-current' | 'use-working-copy') =>
      repository.resolveDocumentConflict(workingCopy!.id, {
        resolution,
        expected_head_artifact_id: workingCopy!.conflict_head_artifact_id!,
      }),
    onSuccess: (copy) => {
      setWorkingCopy(copy);
      announce('Working-copy conflict resolved against the confirmed artifact head.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const { mutate: openCopy } = createWorkingCopy;
  const { mutate: reveal } = revealSource;
  const { mutateAsync: renderPdf } = rendition;
  const { mutate: closeCopy } = closeWorkingCopy;
  const onOpen = useCallback((target: DocumentOpenTarget) => openCopy(target), [openCopy]);
  const onReveal = useCallback(() => reveal(), [reveal]);
  const onPdf = useCallback(() => renderPdf(), [renderPdf]);
  const onCloseWorkingCopy = useCallback(() => closeCopy(), [closeCopy]);
  const openActions = useDocumentOpenActions({
    artifact,
    manifest: manifest.data,
    openPending: createWorkingCopy.isPending,
    pdfPending: rendition.isPending,
    pdfUnavailable: runtimeMissing ? 'Needs the document runtime' : undefined,
    revealPending: revealSource.isPending,
    workingCopyActive: workingCopy?.status === 'active',
    closePending: closeWorkingCopy.isPending,
    onOpen,
    onReveal,
    onPdf,
    onCloseWorkingCopy,
  });
  useFileViewerActions(openActions);

  const textContent = useMemo(
    () =>
      content.data && effectiveManifest?.profile !== 'pdf'
        ? new TextDecoder('utf-8', { ignoreBOM: true }).decode(content.data)
        : fallbackSource,
    [content.data, effectiveManifest?.profile, fallbackSource],
  );
  const latexSource = useMemo(
    () => (textContent === undefined ? undefined : { name: artifact.name, text: textContent }),
    [artifact.name, textContent],
  );
  const fileFormat = textFileFormat(artifact.name, artifact.media_type);
  // A paper is its project: it opens as the LaTeX workspace, whose source pane shows every file.
  const paper = isScientificDocument(artifact);
  const sourceProfile = paper
    ? 'latex'
    : effectiveManifest && isDocumentSourceProfile(effectiveManifest.profile)
      ? effectiveManifest.profile
      : fileFormat === 'markdown'
        ? 'markdown'
        : fileFormat === 'html'
          ? 'html-static'
          : artifact.name.toLowerCase().endsWith('.tex')
            ? 'latex'
            : undefined;
  const activeView = documentView;
  const copyable = Boolean(sourceProfile) && (activeView === 'raw' || activeView === 'preview');
  const readText = useCallback(
    () =>
      activeView === 'raw' || sourceProfile === 'html-static' || sourceProfile === 'latex'
        ? textContent
        : renderedFileText(previewRef.current),
    [activeView, sourceProfile, textContent],
  );
  // Without its registered revision the saved result is still readable, but only as a preview.
  const previewOnly = manifest.isError ? 'Preview only' : undefined;
  useFileViewerFacts(previewOnly ? [previewOnly] : undefined);
  const decision =
    workingCopy?.status === 'conflict' || workingCopy?.status === 'error' ? workingCopy : undefined;
  // The version that moved on while the copy was open, so the conflict can name it.
  const conflictHeadId =
    decision?.status === 'conflict' ? decision.conflict_head_artifact_id : undefined;
  const conflictHead = useQuery({
    queryKey: queryKeys.key('document-manifest', settings.endpoint, conflictHeadId),
    queryFn: ({ signal }) => repository.documentManifest(conflictHeadId!, signal),
    enabled: conflictHeadId !== undefined,
  });

  const copy = copyable ? (
    <TextFileCopyAction
      name={artifact.name}
      disabled={textContent === undefined}
      readText={readText}
    />
  ) : null;
  const information = (
    <FileViewerInformation label="Document information">
      <p className="text-sm font-medium">{profileLabel(manifest.data ?? effectiveManifest)}</p>
      {needsPdfPreview && pdfPreview.data ? (
        <p className="text-xs text-muted-foreground">Saved PDF preview</p>
      ) : null}
      <p className="break-all font-mono text-xs text-muted-foreground">
        {effectiveManifest
          ? `Version ${effectiveManifest.version}, ${effectiveManifest.sha256}`
          : manifest.error
            ? 'Comments, revision history and editing are unavailable: its registered revision could not be loaded.'
            : 'Checking document capabilities…'}
      </p>
      {workingCopy?.status === 'active' ? (
        <p className="text-xs text-muted-foreground">
          A working copy is open; stable saves become revisions.
        </p>
      ) : null}
    </FileViewerInformation>
  );
  // A paper's Render, Source and Side by side are the LaTeX workspace's own.
  const modes =
    sourceProfile === 'latex' ? null : (
      <DocumentViewControls
        value={activeView}
        markdown={sourceProfile === 'markdown'}
        html={sourceProfile === 'html-static'}
        onChange={setDocumentView}
      />
    );
  const threads = <CommentThreadList artifactId={artifact.id} sessionId={artifact.session_id} />;
  const refresh = (
    <DocumentRefreshAction
      refreshing={manifest.isFetching || pdfPreview.isFetching || content.isFetching}
      onReviews={() =>
        queryClient.invalidateQueries({
          queryKey: commentThreadsKey(settings.endpoint, artifact.id),
        })
      }
    />
  );

  return withComments(
    commentSurface,
    inFrameComments ? <EarlierThreads>{threads}</EarlierThreads> : undefined,
    <section
      aria-label="Document workspace"
      className="@container/viewer flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
    >
      <ViewerToolbarHost.Provider value={toolbarHost}>
        <Tabs
          className="flex h-full min-h-0 min-w-0 flex-col gap-0 overflow-hidden"
          value={activeView}
          onValueChange={setDocumentView}
        >
          {ownRow ? (
            <FrameBar
              label="File"
              where={<FrameCrumbs parts={[{ label: artifactDisplayName(artifact) }]} />}
              what={previewOnly ? <span data-frame-position="">{previewOnly}</span> : undefined}
              format={
                <div
                  className="flex shrink-0 items-center gap-0.5 empty:hidden"
                  data-slot="frame-format-host"
                  ref={setLocalHost}
                />
              }
              actions={
                <>
                  {copy}
                  <CommentToggle />
                  {inFrameComments ? null : (
                    <DocumentCommentThreads>{threads}</DocumentCommentThreads>
                  )}
                  {information}
                  {refresh}
                  <StandaloneDocumentOpen artifact={artifact} actions={openActions} />
                </>
              }
            />
          ) : (
            <>
              {copy}
              <CommentToggle />
              {information}
              {refresh}
            </>
          )}
          {toolbarHost && modes ? <ViewerToolbarContent>{modes}</ViewerToolbarContent> : null}
          {status ? (
            <p className="sr-only" role="status">
              {status}
            </p>
          ) : null}
          {decision ? (
            <WorkingCopyState
              copy={decision}
              headVersion={conflictHead.data?.version}
              pending={resolveConflict.isPending}
              onResolve={(resolution) => resolveConflict.mutate(resolution)}
              onDismiss={() => setWorkingCopy(undefined)}
            />
          ) : (
            <>
              <TabsContent
                className="m-0 min-h-0 min-w-0 overflow-hidden"
                value="preview"
                aria-label="Document preview"
                aria-labelledby={undefined}
              >
                <div className="h-full min-h-0 min-w-0 overflow-hidden" ref={previewRef}>
                  {sourceProfile === 'latex' ? (
                    // A paper: its PDF and source, built by the server; its modes join this frame.
                    <LatexWorkspace
                      artifactId={artifact.id}
                      framed
                      sessionId={artifact.session_id ?? ''}
                      source={latexSource}
                    />
                  ) : (
                    <CommentCapture
                      regionAnchor={
                        effectiveManifest?.profile === 'pdf' ? pdfRegionAnchor : undefined
                      }
                      sourcePath={effectiveManifest?.name}
                    >
                      <DocumentPreview
                        content={content.data}
                        fallback={
                          sourceProfile === 'html-static' && textContent !== undefined ? (
                            <HtmlFileInBrowser
                              artifactId={artifact.id}
                              content={textContent}
                              name={artifact.name}
                              openOnShow
                            />
                          ) : (
                            fallbackPreview
                          )
                        }
                        fit="page"
                        manifest={effectiveManifest}
                        manifestPending={manifest.isPending}
                        previewError={
                          runtimeMissing
                            ? undefined
                            : ((needsPdfPreview ? pdfPreview.error?.message : undefined) ??
                              (effectiveManifest?.profile === 'pdf'
                                ? content.error?.message
                                : undefined))
                        }
                        runtimeMissing={runtimeMissing}
                        unavailable={unavailablePreview}
                        pdfName={documentPdfFileName(artifact.name)}
                        previewPending={
                          needsPdfPreview && (pdfPreview.isPending || pdfPreview.isFetching)
                        }
                        previewLabel={
                          manifest.data?.pdf_rendition_artifact_id
                            ? 'Loading PDF preview…'
                            : 'Rendering PDF preview…'
                        }
                        onRetryPreview={() => {
                          if (pdfPreview.isError) void pdfPreview.refetch();
                          else void content.refetch();
                        }}
                        text={textContent}
                      />
                    </CommentCapture>
                  )}
                </div>
              </TabsContent>
              {sourceProfile ? (
                <TabsContent className="m-0 min-h-0 min-w-0 overflow-hidden" value="raw">
                  <DocumentSourceView
                    content={textContent}
                    name={artifact.name}
                    profile={sourceProfile}
                  />
                </TabsContent>
              ) : null}
            </>
          )}
        </Tabs>
      </ViewerToolbarHost.Provider>
    </section>,
  );
}

/** Download and Open ▾ for a document outside a file viewer, as the frame would show them. */
function StandaloneDocumentOpen({
  artifact,
  actions,
}: {
  artifact: Artifact;
  actions: readonly FileViewerAction[];
}) {
  const take = useOpenTake(
    { kind: 'artifact', artifact, workspaceId: artifact.workspace_id ?? '' },
    actions.filter((action) => action.kind === 'download'),
    { otherApps: false, rows: actions.filter((action) => action.kind === 'open') },
  );
  return (
    <span className="inline-flex items-center gap-0.5">
      <FrameDownloadButton take={take} />
      <FrameOpenButton take={take} />
    </span>
  );
}

/** The sent threads beside Comments, for a document outside a frame. */
function DocumentCommentThreads({ children }: { children: ReactNode }) {
  const session = useCommentSession();
  if (!session?.open) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <ToolbarAction label="Comment threads">
          <MessagesSquareIcon aria-hidden="true" />
        </ToolbarAction>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[70dvh] w-[min(26rem,calc(100vw-1rem))] overflow-auto p-0"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** The sent threads inside the frame's comment panel. */
function EarlierThreads({ children }: { children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button className="mt-2 w-full" size="sm" variant="ghost">
          <MessagesSquareIcon aria-hidden="true" />
          Earlier threads
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="z-[95] max-h-[70dvh] w-[min(26rem,calc(100vw-1rem))] overflow-auto p-0"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

function DocumentPreview({
  content,
  fallback,
  fit,
  manifest,
  manifestPending,
  previewError,
  previewPending,
  previewLabel,
  onRetryPreview,
  runtimeMissing,
  text,
  unavailable,
  pdfName,
}: {
  content?: Uint8Array;
  fallback: ReactNode;
  fit: 'page' | 'width';
  manifest?: DocumentManifest;
  manifestPending: boolean;
  previewError?: string;
  previewPending: boolean;
  previewLabel: string;
  onRetryPreview: () => void;
  runtimeMissing: boolean;
  text?: string;
  unavailable?: ReactNode;
  /** The PDF's name as people know it, not the rendition's registry key. */
  pdfName?: string;
}) {
  if (!manifest)
    return manifestPending ? <ResourceLoading label="Opening the document…" /> : fallback;
  if (runtimeMissing && (unavailable ?? fallback)) return unavailable ?? fallback;
  if (previewError && !previewPending) {
    return (
      <StateView
        action={{ label: 'Retry preview', onClick: onRetryPreview }}
        detail={previewError}
        kind="error"
        size="viewer"
        title="PDF preview failed"
      />
    );
  }
  if (previewPending && !content) return <ResourceLoading label={previewLabel} />;
  if (manifest.profile === 'pdf') {
    return (
      // The viewer owns its own scroll region so it can mount only the pages in
      // view, which needs a bounded box to scroll inside.
      <div className="h-full min-h-0 w-full">
        <ClioPdfPreview bytes={content} fit={fit} name={pdfName ?? manifest.name} />
      </div>
    );
  }
  if (manifest.profile === 'markdown' && text !== undefined) {
    return <FileReadView name={manifest.name} content={text} format="markdown" />;
  }
  if (manifest.profile === 'html-static' && text !== undefined) {
    return (
      <HtmlFileInBrowser
        artifactId={manifest.artifact_id}
        content={text}
        name={manifest.name}
        openOnShow
      />
    );
  }
  if (manifest.profile === 'latex' && text !== undefined) {
    return (
      <CodeBlock className="h-full overflow-auto" code={text} language="latex" showLineNumbers />
    );
  }
  if (!directProfiles.has(manifest.profile)) {
    if (fallback) return fallback;
    return (
      <ResourceUnavailable
        label="Preview unavailable"
        detail={`PDF previews are not supported for this ${profileLabel(manifest).toLowerCase()}.`}
      />
    );
  }
  return fallback;
}

/** The server could not make a PDF because its document runtime is missing or still preparing. */
function renditionUnavailable(error: unknown): boolean {
  return (
    error instanceof TransportError &&
    (error.code === 'rendition_unavailable' || error.status === 501)
  );
}

function profileLabel(manifest?: DocumentManifest) {
  if (!manifest) return 'Document';
  const labels: Partial<Record<DocumentManifest['profile'], string>> = {
    markdown: 'Markdown document',
    pdf: 'PDF document',
    latex: 'LaTeX document',
    'html-static': 'Static HTML document',
    'ooxml-word': 'Word document',
    'ooxml-sheet': 'Excel workbook',
    'ooxml-slides': 'PowerPoint deck',
    'odf-text': 'OpenDocument text',
    'odf-sheet': 'OpenDocument spreadsheet',
    'odf-slides': 'OpenDocument presentation',
  };
  return labels[manifest.profile] ?? 'Document';
}

/**
 * What the document workspace offers the shared comment session (comments plan, modes table).
 * `manifest` is what is shown (an Office file's PDF rendition); `source` is the version the
 * comments are about, which the server resolves on its rendition (comments plan, rule 3).
 */
function documentCommentSurface(
  artifact: Artifact,
  manifest?: DocumentManifest,
  source: DocumentManifest | undefined = manifest,
): CommentSurface {
  if (!manifest || manifest.profile === 'html-static') {
    // HTML takes its comments in the shared browser, where it runs. Until the version is known the session takes no marks (its toggle stays hidden), but
    // it is rendered so the workspace keeps its place in the tree when the manifest loads.
    return {
      title: artifact.name,
      modes: ['text'],
      defaultMode: 'text',
      destination: {
        kind: 'artifact',
        sessionId: artifact.session_id,
        artifactId: '',
        version: 0,
        sha256: '',
      },
    };
  }
  const modes: CommentSurface['modes'][number][] = [];
  if (manifest.anchors.includes('text-quote') || manifest.anchors.includes('pdf-quad'))
    modes.push('text');
  // A LaTeX paper's PDF pane takes regions, like a PDF.
  if (
    manifest.anchors.includes('region') &&
    (manifest.profile === 'pdf' || manifest.profile === 'latex')
  )
    modes.push('region');
  return {
    title: artifactDisplayName(artifact),
    modes: modes.length ? modes : ['text'],
    defaultMode: modes[0] ?? 'text',
    destination: {
      kind: 'artifact',
      sessionId: artifact.session_id,
      artifactId: (source ?? manifest).artifact_id,
      version: (source ?? manifest).version,
      sha256: (source ?? manifest).sha256,
    },
  };
}

function withComments(surface: CommentSurface, threadList: ReactNode, node: ReactNode) {
  return (
    <CommentSessionProvider surface={surface} threadList={threadList}>
      {node}
    </CommentSessionProvider>
  );
}
