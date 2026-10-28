import { queryKeys } from '@/lib/query-keys';
import { renderedFileText, textFileFormat } from '@/lib/file-presentation';
import type {
  Artifact,
  DocumentAnchor,
  DocumentEditorSession,
  DocumentManifest,
  DocumentWorkingCopy,
} from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlertIcon, MessageSquareTextIcon } from 'lucide-react';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { CodeBlock } from '@/components/ai-elements/code-block';
import {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from '@/components/reui/timeline';
import { badgeVariants } from '@/components/reui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
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
import { ClioOnlyOfficeEditor } from './onlyoffice-editor';
import { ClioPdfPreview } from './pdf-preview';
import { ClioStatus } from './status';
import { TechnicalDetails } from './technical-details';
import { ResourceLoading, ResourceUnavailable } from './resource-states';
import { FileReadView } from './file-text-view';
import { DocumentSourceView } from './document-source-view';
import { isDocumentSourceProfile } from './document-open-policy';
import { prepareDocumentPdf } from './document-pdf';
import { editorLabel, openDocumentTarget } from './document-launch';
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
  const htmlReader = useRef<(() => Promise<string>) | undefined>(undefined);
  const [htmlReady, setHtmlReady] = useState(false);
  const registerHtmlReader = useCallback((reader?: () => Promise<string>) => {
    htmlReader.current = reader;
    setHtmlReady(Boolean(reader));
  }, []);
  const [selection, setSelection] = useState<DocumentAnchor>();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewText, setReviewText] = useState('');
  const [status, setStatus] = useState('');
  const [documentView, setDocumentView] = useState('preview');
  const [workingCopy, setWorkingCopy] = useState<DocumentWorkingCopy>();
  const [editor, setEditor] = useState<DocumentEditorSession>();
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
  const content = useQuery({
    queryKey: queryKeys.key('document-content', settings.endpoint, effectiveManifest?.artifact_id),
    queryFn: ({ signal }) => repository.documentContent(effectiveManifest!.artifact_id, signal),
    enabled: Boolean(effectiveManifest && directProfiles.has(effectiveManifest.profile)),
  });
  const reviews = useQuery({
    queryKey: queryKeys.key('artifact-reviews', settings.endpoint, artifact.id),
    queryFn: ({ signal }) => repository.artifactReviews(artifact.id, signal),
    enabled: Boolean(manifest.data),
  });
  const editorHealth = useQuery({
    queryKey: queryKeys.key('document-editor-health', settings.endpoint),
    queryFn: ({ signal }) => repository.documentEditorHealth(signal),
    enabled: Boolean(manifest.data?.embedded_editors.length),
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

  const submitReview = useMutation({
    mutationFn: async () => {
      if (!effectiveManifest || !selection || !reviewText.trim()) {
        throw new Error('Select document text and write a review instruction first.');
      }
      return repository.submitArtifactReview(artifact.session_id, {
        artifact_id: effectiveManifest.artifact_id,
        expected_version: effectiveManifest.version,
        expected_sha256: effectiveManifest.sha256,
        anchor: selection,
        text: reviewText.trim(),
        idempotency_key: `ui-review-${crypto.randomUUID()}`,
        allow_historical: effectiveManifest.artifact_id !== artifact.id,
      });
    },
    onSuccess: async () => {
      setReviewOpen(false);
      setReviewText('');
      setSelection(undefined);
      window.getSelection()?.removeAllRanges();
      setStatus('Review sent to the agent against this exact immutable revision.');
      await queryClient.invalidateQueries({
        queryKey: queryKeys.key('artifact-reviews', settings.endpoint, artifact.id),
      });
    },
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
      setWorkingCopy(result.kind === 'native' && result.desktopCopy ? undefined : result.copy);
      if (result.kind === 'embedded') {
        setEditor(result.launched);
        setStatus(`${editorLabel(result.launched.provider)} editing session ready.`);
      } else {
        const message = `${result.isPdf ? 'PDF' : artifact.name} opened in ${result.appName}.${
          result.desktopCopy
            ? ' Opened a desktop copy; edits are local to this copy.'
            : result.copy?.auto_checkpoint
              ? ' Stable saves become immutable revisions.'
              : ''
        }`;
        setStatus(message);
        toast.success(message);
      }
    },
  });
  const closeWorkingCopy = useMutation({
    mutationFn: () => repository.closeDocumentWorkingCopy(workingCopy!.id),
    onSuccess: (copy) => {
      setWorkingCopy(copy);
      setEditor(undefined);
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
  const captureTextSelection = () => {
    const current = window.getSelection();
    const host = previewRef.current;
    if (!current || current.isCollapsed || !current.rangeCount || !host) return;
    const range = current.getRangeAt(0);
    if (!host.contains(range.commonAncestorContainer)) return;
    const exact = current.toString().trim();
    if (!exact || !effectiveManifest?.anchors.includes('text-quote')) return;
    setSelection({ profile: 'text-quote', exact, source_path: effectiveManifest.name });
  };
  const activeView = sourceProfile === 'latex' && documentView === 'preview' ? 'raw' : documentView;

  return (
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
                reviewCount={reviews.data?.length ?? 0}
                onChange={setDocumentView}
              />
            </div>
            {sourceProfile && (activeView === 'raw' || activeView === 'preview') ? (
              <TextFileCopyAction
                name={artifact.name}
                disabled={
                  textContent === undefined ||
                  (activeView === 'preview' && sourceProfile === 'html-static' && !htmlReady)
                }
                readText={() =>
                  activeView === 'raw'
                    ? textContent
                    : sourceProfile === 'html-static'
                      ? htmlReader.current?.()
                      : renderedFileText(previewRef.current)
                }
              />
            ) : null}
            {selection ? (
              <Button onClick={() => setReviewOpen(true)} size="sm" variant="secondary">
                <MessageSquareTextIcon aria-hidden="true" /> Review selection
              </Button>
            ) : null}
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
                editorHealth={editorHealth.data}
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
              refreshing={
                manifest.isFetching ||
                pdfPreview.isFetching ||
                content.isFetching ||
                reviews.isFetching
              }
              onReviews={reviews.refetch}
              onEditorHealth={editorHealth.refetch}
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
          <div
            className="h-full min-h-0 min-w-0 overflow-hidden"
            ref={previewRef}
            onMouseUp={captureTextSelection}
          >
            <DocumentPreview
              content={content.data}
              editor={editor}
              fallback={
                sourceProfile === 'html-static' && textContent !== undefined ? (
                  <FileReadView
                    name={artifact.name}
                    content={textContent}
                    format="html"
                    onHtmlTextReader={registerHtmlReader}
                  />
                ) : (
                  fallbackPreview
                )
              }
              fit="page"
              manifest={effectiveManifest}
              onPdfSelection={setSelection}
              onHtmlTextReader={registerHtmlReader}
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
          aria-label="Reviews"
          aria-labelledby={undefined}
        >
          <h2 className="mb-3 text-base font-semibold">Reviews</h2>
          <ReviewTimeline error={reviews.error?.message} reviews={reviews.data} />
        </TabsContent>
        <TabsContent
          className="m-0 min-h-0 min-w-0 overflow-auto p-3"
          value="policy"
          aria-label="Document safety"
          aria-labelledby={undefined}
        >
          <h2 className="mb-3 text-base font-semibold">Document safety</h2>
          <DocumentPolicy editorHealth={editorHealth.data} workingCopy={workingCopy} />
        </TabsContent>
      </Tabs>
      <Dialog onOpenChange={setReviewOpen} open={reviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send selection to the agent</DialogTitle>
            <DialogDescription>
              This instruction is bound to version {effectiveManifest?.version ?? 'Unavailable'} and
              its checksum. If the artifact changes, the service rejects a stale review.
            </DialogDescription>
          </DialogHeader>
          <blockquote className="max-h-32 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs">
            {selection?.exact || selection?.cell_range || 'Selected document region'}
          </blockquote>
          <Textarea
            aria-label="Review instruction"
            autoFocus
            onChange={(event) => setReviewText(event.target.value)}
            placeholder="Tell the agent what to revise, verify, or explain…"
            rows={5}
            value={reviewText}
          />
          {submitReview.error ? (
            <p className="text-sm text-destructive">{submitReview.error.message}</p>
          ) : null}
          <DialogFooter>
            <Button onClick={() => setReviewOpen(false)} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={!reviewText.trim() || submitReview.isPending}
              onClick={() => submitReview.mutate()}
            >
              {submitReview.isPending ? 'Sending…' : 'Send review'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function DocumentPreview({
  content,
  editor,
  fallback,
  fit,
  manifest,
  onPdfSelection,
  onHtmlTextReader,
  previewError,
  previewPending,
  previewLabel,
  onRetryPreview,
  text,
}: {
  content?: Uint8Array;
  editor?: DocumentEditorSession;
  fallback: ReactNode;
  fit: 'page' | 'width';
  manifest?: DocumentManifest;
  onPdfSelection: (anchor: DocumentAnchor) => void;
  onHtmlTextReader: (reader?: () => Promise<string>) => void;
  previewError?: string;
  previewPending: boolean;
  previewLabel: string;
  onRetryPreview: () => void;
  text?: string;
}) {
  if (editor?.status === 'ready' && editor.editor_url) {
    return editor.provider === 'onlyoffice' ? (
      <ClioOnlyOfficeEditor config={editor.config} editorUrl={editor.editor_url} />
    ) : (
      <iframe
        className="h-full min-h-0 w-full border-0 bg-background"
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-forms allow-same-origin allow-downloads allow-popups"
        src={editor.editor_url}
        title="Collabora document editor"
      />
    );
  }
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
      <div className="space-y-3 p-4" role="status" aria-live="polite">
        <p className="text-sm text-muted-foreground">{previewLabel}</p>
        <ResourceLoading label={previewLabel} />
      </div>
    );
  }
  if (manifest.profile === 'pdf') {
    return (
      // The viewer owns its own scroll region so it can mount only the pages in
      // view, which needs a bounded box to scroll inside — the same one the
      // editor branch above uses.
      <div className="h-full min-h-0 w-full">
        <ClioPdfPreview
          bytes={content}
          fit={fit}
          name={manifest.name}
          onSelection={onPdfSelection}
        />
      </div>
    );
  }
  if (manifest.profile === 'markdown' && text !== undefined) {
    return <FileReadView name={manifest.name} content={text} format="markdown" />;
  }
  if (manifest.profile === 'html-static' && text !== undefined) {
    return (
      <FileReadView
        name={manifest.name}
        content={text}
        format="html"
        onHtmlTextReader={onHtmlTextReader}
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

function ReviewTimeline({
  reviews,
  error,
}: {
  reviews?: Awaited<ReturnType<ReturnType<typeof useRepository>['artifactReviews']>>;
  error?: string;
}) {
  if (error) return <ClioStatus detail={error} label="Reviews unavailable" value="degraded" />;
  if (!reviews) return <p className="text-sm text-muted-foreground">Loading reviews…</p>;
  if (!reviews.length) {
    return <p className="text-sm text-muted-foreground">No reviews on this artifact chain yet.</p>;
  }
  return (
    <Timeline defaultValue={reviews.length}>
      {reviews.map((review, index) => (
        <TimelineItem key={review.id} step={index + 1}>
          <TimelineIndicator />
          <TimelineSeparator />
          <TimelineDate dateTime={review.created_at}>
            {new Date(review.created_at).toLocaleString()}
          </TimelineDate>
          <TimelineHeader className="flex flex-wrap items-center gap-2">
            <TimelineTitle>{review.native ? 'Native comment' : 'Agent review'}</TimelineTitle>
            <ClioStatus
              label={review.status.replaceAll('_', ' ')}
              value={reviewStatusValue(review.status)}
            />
          </TimelineHeader>
          <TimelineContent>
            <q>{review.anchor.exact || review.anchor.cell_range || 'Document selection'}</q>
            <p className="mt-1 text-foreground">{review.text}</p>
            <p className="mt-1 font-mono text-[0.625rem]">Revision {review.artifact_version}</p>
          </TimelineContent>
        </TimelineItem>
      ))}
    </Timeline>
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

function reviewStatusValue(status: 'queued' | 'dispatched' | 'human-note' | 'failed' | 'stale') {
  if (status === 'queued') return 'queued' as const;
  if (status === 'failed' || status === 'stale') return 'failed' as const;
  return 'completed' as const;
}
