import { queryKeys } from '@/lib/query-keys';
import { renderedFileText, textFileFormat } from '@/lib/file-presentation';
import type { Artifact, DocumentManifest, DocumentWorkingCopy } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlertIcon } from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { CommentCapture, CommentToggle } from './comments/comment-capture';
import type { CommentSurface } from './comments/comment-model';
import {
  CommentSessionProvider,
  commentThreadsKey,
  useCommentSession,
} from './comments/comment-session';
import { CommentThreadList } from './comments/comment-thread-list';
import { pdfRegionAnchor } from './comments/region-anchors';
import { HtmlFileInBrowser } from './html-in-browser';
import { CodeBlock } from '@/components/ai-elements/code-block';
import { badgeVariants } from '@/components/reui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { DocumentViewControls } from './document-view-controls';
import { ViewerToolbarContent } from './viewer-toolbar';
import { FileViewerInformation } from './file-viewer-information';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { documentApplications, revealFileBytes } from '@/tauri/documents';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { downloadBytes } from './surface-export';
import { DocumentOpenMenu, type DocumentOpenTarget } from './document-open-menu';
import { DocumentRefreshAction } from './document-refresh-action';
import { ClioPdfPreview } from './pdf-preview';
import { TechnicalDetails } from './technical-details';
import { ResourceLoading, ResourceUnavailable } from './resource-states';
import { FileReadView } from './file-text-view';
import { DocumentSourceView } from './document-source-view';
import { isDocumentSourceProfile } from './document-open-policy';
import { prepareDocumentPdf } from './document-pdf';
import { openDocumentTarget } from './document-launch';
import { TextFileCopyAction } from './text-file-copy-action';
import { DocumentDownloadActions } from './document-download-actions';
import { DocumentPolicy, WorkingCopyStatus } from './document-working-copy';

const directProfiles = new Set(['markdown', 'pdf', 'latex', 'html-static']);

export function ClioDocumentWorkspace({
  artifact,
  fallbackPreview,
  fallbackSource,
}: {
  artifact: Artifact;
  fallbackPreview: ReactNode;
  fallbackSource?: string;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const queryClient = useQueryClient();
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
  const commentSurface = useMemo<CommentSurface>(
    () => documentCommentSurface(artifact, effectiveManifest),
    [artifact, effectiveManifest],
  );
  const commentThreads = useQuery({
    queryKey: commentThreadsKey(settings.endpoint, artifact.id),
    queryFn: ({ signal }) => repository.commentThreads(artifact.id, artifact.session_id, signal),
    enabled: Boolean(manifest.data),
  });
  const commentCount =
    commentThreads.data?.threads.filter((row) => row.status !== 'draft').length ?? 0;
  const refreshComments = () => commentThreads.refetch();
  const content = useQuery({
    queryKey: queryKeys.key('document-content', settings.endpoint, effectiveManifest?.artifact_id),
    queryFn: ({ signal }) => repository.documentContent(effectiveManifest!.artifact_id, signal),
    enabled: Boolean(effectiveManifest && directProfiles.has(effectiveManifest.profile)),
  });
  const applications = useQuery({
    queryKey: ['document-applications', artifact.name, artifact.media_type],
    queryFn: () => documentApplications(artifact.name, artifact.media_type),
    enabled: inTauri(),
    staleTime: 60_000,
  });
  const pdfApplications = useQuery({
    queryKey: ['document-applications', 'file.pdf', 'application/pdf'],
    queryFn: () => documentApplications('file.pdf', 'application/pdf'),
    enabled:
      inTauri() &&
      Boolean(
        manifest.data?.rendition_formats.includes('pdf') ||
          manifest.data?.pdf_rendition_artifact_id,
      ),
    staleTime: 60_000,
  });

  const preparePdf = () => queryClient.fetchQuery(pdfOptions);
  const rendition = useMutation({
    mutationFn: async () => {
      const pdf = await preparePdf();
      const bytes = await repository.documentContent(pdf.artifact_id);
      downloadBytes(bytes, 'application/pdf', pdf.name);
    },
    onSuccess: () => setStatus('PDF downloaded.'),
  });
  const createWorkingCopy = useMutation({
    mutationFn: (target: DocumentOpenTarget) =>
      openDocumentTarget(repository, manifest.data, artifact.session_id, preparePdf, target),
    onSuccess: (result) => {
      setWorkingCopy(result.desktopCopy ? undefined : result.copy);
      const message = `${result.isPdf ? 'PDF' : artifact.name} opened in ${result.appName}.${
        result.desktopCopy
          ? ' Opened a desktop copy; edits are local to this copy.'
          : result.copy?.auto_checkpoint
            ? ' Stable saves become immutable revisions.'
            : ''
      }`;
      setStatus(message);
      toast.success(message);
    },
  });
  const closeWorkingCopy = useMutation({
    mutationFn: () => repository.closeDocumentWorkingCopy(workingCopy!.id),
    onSuccess: (copy) => {
      setWorkingCopy(copy);
      setStatus('Working copy closed. The immutable artifact history remains available.');
    },
  });
  const downloadSource = useMutation({
    mutationFn: async () => {
      const bytes = await repository.readArtifactBytesFor(artifact);
      downloadBytes(bytes, artifact.media_type, artifact.name);
    },
  });
  const revealSource = useMutation({
    mutationFn: async () =>
      revealFileBytes(
        artifact.name.split(/[\\/]/u).at(-1)!,
        await repository.documentContent(artifact.id),
      ),
    onSuccess: () => toast.success('Desktop copy shown in its folder.'),
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
      setStatus('Working-copy conflict resolved against the confirmed artifact head.');
    },
  });

  const textContent = useMemo(
    () =>
      content.data && effectiveManifest?.profile !== 'pdf'
        ? new TextDecoder('utf-8', { ignoreBOM: true }).decode(content.data)
        : fallbackSource,
    [content.data, effectiveManifest?.profile, fallbackSource],
  );
  const fileFormat = textFileFormat(artifact.name, artifact.media_type);
  const sourceProfile =
    effectiveManifest && isDocumentSourceProfile(effectiveManifest.profile)
      ? effectiveManifest.profile
      : fileFormat === 'markdown'
        ? 'markdown'
        : fileFormat === 'html'
          ? 'html-static'
          : artifact.name.toLowerCase().endsWith('.tex')
            ? 'latex'
            : undefined;
  const activeView = sourceProfile === 'latex' && documentView === 'preview' ? 'raw' : documentView;

  return withComments(
    commentSurface,
    <section
      aria-label="Document workspace"
      className="@container/viewer flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
    >
      <Tabs
        className="flex h-full min-h-0 min-w-0 flex-col gap-0 overflow-hidden"
        value={activeView}
        onValueChange={setDocumentView}
      >
        <ViewerToolbarContent>
          <div className="flex min-w-0 shrink-0 items-center gap-0.5" data-slot="document-controls">
            <FileViewerInformation label="Document information">
              <p className="text-sm font-medium">
                {profileLabel(manifest.data ?? effectiveManifest)}
              </p>
              {needsPdfPreview && pdfPreview.data ? (
                <p className="text-xs text-muted-foreground">Saved PDF preview</p>
              ) : null}
              <p className="break-all font-mono text-xs text-muted-foreground">
                {effectiveManifest
                  ? `Version ${effectiveManifest.version}, ${effectiveManifest.sha256}`
                  : manifest.error
                    ? 'Saved content is readable.'
                    : 'Checking document capabilities…'}
              </p>
              {status ? <p className="text-xs text-muted-foreground">{status}</p> : null}
              <WorkingCopyStatus
                closePending={closeWorkingCopy.isPending}
                copy={workingCopy}
                onClose={() => closeWorkingCopy.mutate()}
                onResolve={(resolution) => resolveConflict.mutate(resolution)}
                resolvePending={resolveConflict.isPending}
              />
            </FileViewerInformation>
            <div className="flex shrink-0 items-center gap-0.5">
              {manifest.error ? (
                <Popover>
                  <PopoverTrigger
                    aria-label="Preview only: document features unavailable"
                    className={badgeVariants({
                      variant: 'warning-light',
                      radius: 'full',
                      size: 'lg',
                      className: 'h-8 cursor-pointer px-2.5',
                    })}
                  >
                    <CircleAlertIcon aria-hidden="true" />
                    <span className="@max-[480px]/viewer:sr-only">Preview only</span>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80">
                    <PopoverHeader>
                      <PopoverTitle className="flex items-center gap-1.5 text-warning-foreground dark:text-warning">
                        <CircleAlertIcon aria-hidden="true" className="size-4" />
                        Document features unavailable
                      </PopoverTitle>
                      <PopoverDescription>
                        This saved result remains readable, but comments, revision history, and
                        editing are unavailable because its original registered revision could not
                        be loaded.
                      </PopoverDescription>
                    </PopoverHeader>
                    <TechnicalDetails
                      className="text-xs text-muted-foreground"
                      summaryClassName="text-foreground"
                      title="Technical details"
                    >
                      <code className="mt-1 block break-all">{manifest.error.message}</code>
                    </TechnicalDetails>
                  </PopoverContent>
                </Popover>
              ) : null}
              <DocumentViewControls
                value={activeView}
                markdown={sourceProfile === 'markdown'}
                html={sourceProfile === 'html-static'}
                latex={sourceProfile === 'latex'}
                reviewCount={commentCount}
                onChange={setDocumentView}
              />
            </div>
            {sourceProfile && (activeView === 'raw' || activeView === 'preview') ? (
              <TextFileCopyAction
                name={artifact.name}
                disabled={textContent === undefined}
                readText={() =>
                  activeView === 'raw' || sourceProfile === 'html-static'
                    ? textContent
                    : renderedFileText(previewRef.current)
                }
              />
            ) : null}
            <CommentToggle />
            {manifest.data ? (
              <DocumentOpenMenu
                artifact={artifact}
                manifest={manifest.data}
                applications={applications.data ?? []}
                pdfApplications={pdfApplications.data ?? []}
                applicationsPending={applications.isPending && inTauri()}
                applicationsError={applications.error?.message}
                pdfApplicationsPending={pdfApplications.isPending && inTauri()}
                pdfApplicationsError={pdfApplications.error?.message}
                openPending={createWorkingCopy.isPending}
                pdfPending={rendition.isPending}
                onOpen={(target) => createWorkingCopy.mutate(target)}
                onReveal={() => revealSource.mutate()}
                revealPending={revealSource.isPending}
              />
            ) : null}
            {manifest.data ? (
              <DocumentDownloadActions
                name={artifact.name}
                mediaType={artifact.media_type}
                pdf={
                  manifest.data.profile !== 'pdf' &&
                  (Boolean(manifest.data.pdf_rendition_artifact_id) ||
                    manifest.data.rendition_formats.includes('pdf'))
                }
                pdfPending={rendition.isPending || createWorkingCopy.isPending}
                onPdf={rendition.mutateAsync}
                onDownload={downloadSource.mutateAsync}
              />
            ) : null}
            <DocumentRefreshAction
              refreshing={manifest.isFetching || pdfPreview.isFetching || content.isFetching}
              onReviews={refreshComments}
            />
          </div>
        </ViewerToolbarContent>
        {status ? (
          <p className="sr-only" role="status">
            {status}
          </p>
        ) : null}
        {createWorkingCopy.error || rendition.error || downloadSource.error ? (
          <Alert variant="destructive">
            <AlertTitle>Document action failed</AlertTitle>
            <AlertDescription>
              {(createWorkingCopy.error ?? rendition.error ?? downloadSource.error)?.message}
            </AlertDescription>
          </Alert>
        ) : null}
        {workingCopy?.status === 'conflict' || workingCopy?.status === 'error' ? (
          <WorkingCopyStatus
            closePending={closeWorkingCopy.isPending}
            copy={workingCopy}
            onClose={() => closeWorkingCopy.mutate()}
            onResolve={(resolution) => resolveConflict.mutate(resolution)}
            resolvePending={resolveConflict.isPending}
          />
        ) : null}
        <TabsContent
          className="m-0 min-h-0 min-w-0 overflow-hidden"
          value="preview"
          aria-label="Document preview"
          aria-labelledby={undefined}
        >
          <div className="h-full min-h-0 min-w-0 overflow-hidden" ref={previewRef}>
            <CommentCapture
              regionAnchor={effectiveManifest?.profile === 'pdf' ? pdfRegionAnchor : undefined}
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
                previewError={
                  (needsPdfPreview ? pdfPreview.error?.message : undefined) ??
                  (effectiveManifest?.profile === 'pdf' ? content.error?.message : undefined)
                }
                previewPending={needsPdfPreview && (pdfPreview.isPending || pdfPreview.isFetching)}
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
        <TabsContent
          className="m-0 min-h-0 min-w-0 overflow-auto p-3"
          value="reviews"
          aria-label="Comments"
          aria-labelledby={undefined}
        >
          <h2 className="mb-3 text-base font-semibold">Comments</h2>
          <CommentThreadList artifactId={artifact.id} sessionId={artifact.session_id} />
        </TabsContent>
        <TabsContent
          className="m-0 min-h-0 min-w-0 overflow-auto p-3"
          value="policy"
          aria-label="Document safety"
          aria-labelledby={undefined}
        >
          <h2 className="mb-3 text-base font-semibold">Document safety</h2>
          <DocumentPolicy workingCopy={workingCopy} />
        </TabsContent>
      </Tabs>
    </section>,
  );
}

function DocumentPreview({
  content,
  fallback,
  fit,
  manifest,
  previewError,
  previewPending,
  previewLabel,
  onRetryPreview,
  text,
}: {
  content?: Uint8Array;
  fallback: ReactNode;
  fit: 'page' | 'width';
  manifest?: DocumentManifest;
  previewError?: string;
  previewPending: boolean;
  previewLabel: string;
  onRetryPreview: () => void;
  text?: string;
}) {
  const session = useCommentSession();
  if (!manifest) return fallback;
  if (previewError && !previewPending) {
    return (
      <div className="space-y-3 p-4" role="alert">
        <ResourceUnavailable label="PDF preview failed" detail={previewError} />
        <Button onClick={onRetryPreview} size="sm" variant="outline">
          Retry preview
        </Button>
      </div>
    );
  }
  if (previewPending && !content) {
    return (
      <div className="p-4">
        <ResourceLoading label={previewLabel} />
      </div>
    );
  }
  if (manifest.profile === 'pdf') {
    return (
      // The viewer owns its own scroll region so it can mount only the pages in
      // view, which needs a bounded box to scroll inside.
      <div className="h-full min-h-0 w-full">
        <ClioPdfPreview
          bytes={content}
          fit={fit}
          name={manifest.name}
          onSelection={(anchor) => {
            if (session?.active && session.mode === 'text') session.addMark(anchor);
          }}
        />
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
    return (
      <ResourceUnavailable
        label="Preview unavailable"
        detail={`PDF previews are not supported for this ${profileLabel(manifest).toLowerCase()}.`}
      />
    );
  }
  return fallback;
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

/** What the document workspace offers the shared comment session (comments plan, modes table). */
function documentCommentSurface(artifact: Artifact, manifest?: DocumentManifest): CommentSurface {
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
  if (manifest.anchors.includes('region') && manifest.profile === 'pdf') modes.push('region');
  return {
    title: artifact.name,
    modes: modes.length ? modes : ['text'],
    defaultMode: modes[0] ?? 'text',
    destination: {
      kind: 'artifact',
      sessionId: artifact.session_id,
      artifactId: manifest.artifact_id,
      version: manifest.version,
      sha256: manifest.sha256,
    },
  };
}

function withComments(surface: CommentSurface, node: ReactNode) {
  return <CommentSessionProvider surface={surface}>{node}</CommentSessionProvider>;
}
