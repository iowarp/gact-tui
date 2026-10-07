import { queryKeys } from '@/lib/query-keys';
import type {
  Artifact,
  DocumentAnchor,
  DocumentEditorSession,
  DocumentManifest,
  DocumentWorkingCopy,
} from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CircleAlertIcon,
  FileCheck2Icon,
  FileCode2Icon,
  MessageSquareTextIcon,
  ShieldCheckIcon,
} from 'lucide-react';
import { useContext, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { copyText } from '@/lib/clipboard';
import { DOCUMENT_MARKDOWN_CLASS_NAME, normalizeConvertedMarkdown } from '@/lib/document-markdown';
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
import { FileViewerInformationHost } from './file-viewer-context';
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
import {
  documentApplications,
  openDocumentWorkingCopy,
  type DocumentApplication,
} from '@/tauri/documents';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { downloadBytes } from './surface-export';
import { DocumentOpenMenu, type DocumentOpenTarget } from './document-open-menu';
import { RefreshAction } from './refresh-button';
import { ClioOnlyOfficeEditor } from './onlyoffice-editor';
import { ClioPdfPreview } from './pdf-preview';
import { ClioStatus } from './status';
import { TechnicalDetails } from './technical-details';

const directProfiles = new Set(['markdown', 'pdf', 'latex', 'html-static']);

export function ClioDocumentWorkspace({
  artifact,
  fallbackPreview,
}: {
  artifact: Artifact;
  fallbackPreview: ReactNode;
}) {
  const repository = useRepository();
  const sharedFileActions = useContext(FileViewerInformationHost) !== undefined;
  const { settings } = useConnectionSettings();
  const queryClient = useQueryClient();
  const previewRef = useRef<HTMLDivElement>(null);
  const [overrideManifest, setOverrideManifest] = useState<DocumentManifest>();
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
  const previewId =
    manifest.data && !directProfiles.has(manifest.data.profile)
      ? manifest.data.pdf_rendition_artifact_id
      : undefined;
  const savedPreview = useQuery({
    queryKey: queryKeys.key('document-manifest', settings.endpoint, previewId),
    queryFn: ({ signal }) => repository.documentManifest(previewId!, signal),
    enabled: Boolean(previewId && !overrideManifest),
  });
  const effectiveManifest = overrideManifest ?? savedPreview.data ?? manifest.data;
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
    queryKey: ['document-applications'],
    queryFn: documentApplications,
    enabled: inTauri(),
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
  const rendition = useMutation({
    mutationFn: async () => repository.createDocumentRendition(artifact.id, artifact.session_id),
    onSuccess: (result) => {
      setOverrideManifest(result.artifact);
      setEditor(undefined);
      setDocumentView('preview');
      setStatus(
        `Showing a derived PDF created by ${result.converter}; the original remains canonical.`,
      );
    },
  });
  const createWorkingCopy = useMutation({
    mutationFn: async (target: DocumentOpenTarget) => {
      const provider = target === 'onlyoffice' || target === 'collabora' ? target : 'native';
      if (provider !== 'native') {
        const health = await repository.documentEditorHealth();
        const available = health.editors.find((entry) => entry.provider === provider);
        if (!available?.healthy) {
          throw new Error(
            `${editorLabel(provider)} is unavailable. Check its connection before opening it.`,
          );
        }
      }
      const copy = await repository.createDocumentWorkingCopy(artifact.id, {
        session_id: artifact.session_id,
        provider,
        writable: true,
        auto_checkpoint: true,
      });
      try {
        if (provider === 'native') {
          const opened = await openDocumentWorkingCopy(
            copy.path,
            target === 'native' ? undefined : (target as DocumentApplication),
          );
          if (!opened) await copyText(copy.path);
          return { kind: 'native' as const, copy, opened };
        }
        const launched = await repository.createDocumentEditorSession(copy.id, provider);
        if (launched.status !== 'ready' || !launched.editor_url) {
          throw new Error(launched.error || `${editorLabel(provider)} could not start.`);
        }
        return { kind: 'embedded' as const, copy, launched };
      } catch (error) {
        // An editor that did not launch must not leave an apparently active copy.
        try {
          await repository.closeDocumentWorkingCopy(copy.id);
        } catch (closeError) {
          throw new Error(
            `${error instanceof Error ? error.message : 'Editor could not start.'} Could not close its working copy: ${closeError instanceof Error ? closeError.message : 'unknown error'}`,
          );
        }
        throw error;
      }
    },
    onSuccess: (result) => {
      setWorkingCopy(result.copy);
      if (result.kind === 'embedded') {
        setEditor(result.launched);
        setStatus(`${editorLabel(result.launched.provider)} editing session ready.`);
      } else {
        const message = result.opened
          ? 'Opened in the system editor. Stable saves become immutable revisions.'
          : 'Working-copy path copied. Open it in a desktop editor to begin.';
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
        ? new TextDecoder().decode(content.data)
        : undefined,
    [content.data, effectiveManifest?.profile],
  );
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

  return (
    <section
      aria-label="Document workspace"
      className="@container/viewer flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
    >
      <Tabs
        className="flex h-full min-h-0 min-w-0 flex-col gap-0 overflow-hidden"
        value={documentView}
        onValueChange={setDocumentView}
      >
        <ViewerToolbarContent>
          <div className="flex min-w-0 shrink-0 items-center gap-0.5" data-slot="document-controls">
            <FileViewerInformation label="Document information">
              <p className="text-sm font-medium">
                {profileLabel(manifest.data ?? effectiveManifest)}
              </p>
              {savedPreview.data && !overrideManifest ? (
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
                value={documentView}
                markdown={effectiveManifest?.profile === 'markdown'}
                reviewCount={reviews.data?.length ?? 0}
                onChange={setDocumentView}
              />
            </div>
            {selection ? (
              <Button onClick={() => setReviewOpen(true)} size="sm" variant="secondary">
                <MessageSquareTextIcon aria-hidden="true" /> Review selection
              </Button>
            ) : null}
            {manifest.data ? (
              <DocumentOpenMenu
                artifact={artifact}
                manifest={manifest.data}
                previewName={editor ? artifact.name : (effectiveManifest?.name ?? artifact.name)}
                hasPdf={effectiveManifest?.profile === 'pdf'}
                applications={applications.data ?? []}
                editorHealth={editorHealth.data}
                openPending={createWorkingCopy.isPending}
                pdfPending={rendition.isPending}
                downloadPending={downloadSource.isPending}
                onOpen={(target) => createWorkingCopy.mutate(target)}
                onPdf={() => {
                  if (effectiveManifest?.profile === 'pdf') {
                    setEditor(undefined);
                    setDocumentView('preview');
                  } else rendition.mutate();
                }}
                onDownload={() => downloadSource.mutate()}
                hideDownload={sharedFileActions}
              />
            ) : null}
            <RefreshAction
              label="Refresh document revision"
              refreshing={
                manifest.isFetching ||
                savedPreview.isFetching ||
                content.isFetching ||
                reviews.isFetching
              }
              onRefresh={async () => {
                setOverrideManifest(undefined);
                await Promise.all([
                  queryClient.invalidateQueries({
                    queryKey: queryKeys.key('document-manifest', settings.endpoint),
                  }),
                  queryClient.invalidateQueries({
                    queryKey: queryKeys.key('document-content', settings.endpoint),
                  }),
                  reviews.refetch(),
                  editorHealth.refetch(),
                ]);
              }}
            />
          </div>
        </ViewerToolbarContent>
        {status ? (
          <p className="sr-only" role="status">
            {status}
          </p>
        ) : null}
        {createWorkingCopy.error ||
        rendition.error ||
        savedPreview.error ||
        downloadSource.error ? (
          <Alert variant="destructive">
            <AlertTitle>Document action failed</AlertTitle>
            <AlertDescription>
              {
                (
                  createWorkingCopy.error ??
                  rendition.error ??
                  savedPreview.error ??
                  downloadSource.error
                )?.message
              }
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
        <TabsContent className="m-0 min-h-0 min-w-0 overflow-hidden" value="preview">
          <div
            className="h-full min-h-0 min-w-0 overflow-hidden"
            ref={previewRef}
            onMouseUp={captureTextSelection}
          >
            <DocumentPreview
              content={content.data}
              editor={editor}
              fallback={fallbackPreview}
              fit="width"
              manifest={effectiveManifest}
              onPdfSelection={setSelection}
              text={textContent}
            />
          </div>
        </TabsContent>
        {effectiveManifest?.profile === 'markdown' ? (
          <TabsContent className="m-0 min-h-0 min-w-0 overflow-hidden" value="raw">
            {textContent === undefined ? (
              <p className="p-4 text-sm text-muted-foreground">Loading raw Markdown…</p>
            ) : (
              <CodeBlock
                aria-label={`Raw Markdown for ${effectiveManifest.name}`}
                className="h-full min-h-0"
                code={textContent}
                language="markdown"
                role="region"
                showLineNumbers
              >
                <CodeBlockHeader>
                  <CodeBlockTitle>
                    <FileCode2Icon aria-hidden="true" />
                    <CodeBlockFilename>{effectiveManifest.name}</CodeBlockFilename>
                  </CodeBlockTitle>
                  <CodeBlockActions>
                    <CodeBlockCopyButton aria-label={`Copy raw ${effectiveManifest.name}`} />
                  </CodeBlockActions>
                </CodeBlockHeader>
              </CodeBlock>
            )}
          </TabsContent>
        ) : null}
        <TabsContent className="m-0 min-h-0 min-w-0 overflow-auto p-3" value="reviews">
          <ReviewTimeline error={reviews.error?.message} reviews={reviews.data} />
        </TabsContent>
        <TabsContent className="m-0 min-h-0 min-w-0 overflow-auto p-3" value="policy">
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
  text,
}: {
  content?: Uint8Array;
  editor?: DocumentEditorSession;
  fallback: ReactNode;
  fit: 'page' | 'width';
  manifest?: DocumentManifest;
  onPdfSelection: (anchor: DocumentAnchor) => void;
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
    return (
      <article className="h-full min-h-0 min-w-0 overflow-auto bg-background p-5">
        <MessageResponse className={DOCUMENT_MARKDOWN_CLASS_NAME}>
          {normalizeConvertedMarkdown(text)}
        </MessageResponse>
      </article>
    );
  }
  if (['latex', 'html-static'].includes(manifest.profile) && text !== undefined) {
    return (
      <CodeBlock
        className="h-full overflow-auto"
        code={text}
        language={manifest.profile === 'latex' ? 'latex' : 'html'}
        showLineNumbers
      >
        <CodeBlockHeader>
          <CodeBlockTitle>
            <FileCheck2Icon aria-hidden="true" className="size-3.5" />
            <CodeBlockFilename>{manifest.name}</CodeBlockFilename>
          </CodeBlockTitle>
          <CodeBlockActions>
            <CodeBlockCopyButton aria-label={`Copy ${manifest.name}`} />
          </CodeBlockActions>
        </CodeBlockHeader>
      </CodeBlock>
    );
  }
  if (!directProfiles.has(manifest.profile)) {
    return (
      <Alert>
        <FileCheck2Icon aria-hidden="true" />
        <AlertTitle>{profileLabel(manifest)} remains canonical</AlertTitle>
        <AlertDescription>
          Open it in a desktop editor, use an available embedded editor, or render a PDF preview.
        </AlertDescription>
      </Alert>
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

function WorkingCopyStatus({
  copy,
  closePending,
  resolvePending,
  onClose,
  onResolve,
}: {
  copy?: DocumentWorkingCopy;
  closePending: boolean;
  resolvePending: boolean;
  onClose: () => void;
  onResolve: (resolution: 'keep-current' | 'use-working-copy') => void;
}) {
  if (!copy) return null;
  return (
    <Alert
      variant={copy.status === 'conflict' || copy.status === 'error' ? 'destructive' : 'default'}
    >
      <AlertTitle className="flex flex-wrap items-center gap-2">
        Working copy <ClioStatus label={copy.status} value={workingCopyStatusValue(copy.status)} />
      </AlertTitle>
      <AlertDescription>
        Head version {copy.head_version}. Stable saves checkpoint into immutable artifact history.
      </AlertDescription>
      <div className="mt-3 flex flex-wrap gap-2">
        {copy.status === 'conflict' ? (
          <>
            <Button disabled={resolvePending} onClick={() => onResolve('keep-current')} size="sm">
              Keep current artifact
            </Button>
            <Button
              disabled={resolvePending}
              onClick={() => onResolve('use-working-copy')}
              size="sm"
              variant="destructive"
            >
              Use working copy
            </Button>
          </>
        ) : copy.status === 'active' ? (
          <Button disabled={closePending} onClick={onClose} size="sm" variant="outline">
            Close working copy
          </Button>
        ) : null}
      </div>
    </Alert>
  );
}

function DocumentPolicy({
  editorHealth,
  workingCopy,
}: {
  editorHealth?: { editors: Array<{ provider: string; healthy: boolean; error?: string }> };
  workingCopy?: DocumentWorkingCopy;
}) {
  return (
    <Alert>
      <ShieldCheckIcon aria-hidden="true" />
      <AlertTitle>Immutable document boundary</AlertTitle>
      <AlertDescription className="grid gap-3">
        <ul className="list-disc space-y-2 pl-5">
          <li>The original artifact is canonical; PDF renditions are derived.</li>
          <li>Reviews bind to one version and checksum, so stale anchors are rejected.</li>
          <li>Stable working-copy saves mint or deduplicate immutable revisions.</li>
          <li>Embedded editors receive short-lived access to one working copy, not credentials.</li>
        </ul>
        {editorHealth?.editors.map((editor) => (
          <ClioStatus
            detail={editor.error}
            key={editor.provider}
            label={`${editorLabel(editor.provider)} ${editor.healthy ? 'available' : 'unavailable'}`}
            value={editor.healthy ? 'healthy' : 'unavailable'}
          />
        ))}
        {workingCopy ? (
          <p className="font-mono text-[0.625rem]">
            Working copy {workingCopy.id}, head version {workingCopy.head_version}
          </p>
        ) : null}
      </AlertDescription>
    </Alert>
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

function editorLabel(provider: string) {
  if (provider === 'onlyoffice') return 'ONLYOFFICE';
  if (provider === 'collabora') return 'Collabora';
  return 'desktop editor';
}

function reviewStatusValue(status: 'queued' | 'dispatched' | 'human-note' | 'failed' | 'stale') {
  if (status === 'queued') return 'queued' as const;
  if (status === 'failed' || status === 'stale') return 'failed' as const;
  return 'completed' as const;
}

function workingCopyStatusValue(status: DocumentWorkingCopy['status']) {
  if (status === 'active') return 'healthy' as const;
  if (status === 'closed') return 'completed' as const;
  if (status === 'conflict') return 'degraded' as const;
  if (status === 'missing') return 'unavailable' as const;
  return 'failed' as const;
}
