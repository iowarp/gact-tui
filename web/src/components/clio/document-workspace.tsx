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
  BookOpenIcon,
  CircleAlertIcon,
  FileCheck2Icon,
  FileOutputIcon,
  MessageSquareTextIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
} from 'lucide-react';
import { lazy, Suspense, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { copyText } from '@/lib/clipboard';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useRepository } from '@/hooks/use-repository';
import { openDocumentWorkingCopy } from '@/tauri/documents';
import { ClioOnlyOfficeEditor } from './onlyoffice-editor';
import { ClioStatus } from './status';

const directProfiles = new Set(['markdown', 'pdf', 'latex', 'html-static']);
const ClioDocumentPdfViewer = lazy(() =>
  import('./document-pdf-viewer').then((module) => ({ default: module.ClioDocumentPdfViewer })),
);

export function ClioDocumentWorkspace({
  artifact,
  fallbackPreview,
}: {
  artifact: Artifact;
  fallbackPreview: ReactNode;
}) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const previewRef = useRef<HTMLDivElement>(null);
  const [overrideManifest, setOverrideManifest] = useState<DocumentManifest>();
  const [selection, setSelection] = useState<DocumentAnchor>();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewText, setReviewText] = useState('');
  const [status, setStatus] = useState('');
  const [workingCopy, setWorkingCopy] = useState<DocumentWorkingCopy>();
  const [editor, setEditor] = useState<DocumentEditorSession>();
  const manifest = useQuery({
    queryKey: queryKeys.key('document-manifest', artifact.id),
    queryFn: ({ signal }) => repository.documentManifest(artifact.id, signal),
  });
  const effectiveManifest = overrideManifest ?? manifest.data;
  const content = useQuery({
    queryKey: queryKeys.key('document-content', effectiveManifest?.artifact_id),
    queryFn: ({ signal }) => repository.documentContent(effectiveManifest!.artifact_id, signal),
    enabled: Boolean(effectiveManifest && directProfiles.has(effectiveManifest.profile)),
  });
  const reviews = useQuery({
    queryKey: queryKeys.key('artifact-reviews', artifact.id),
    queryFn: ({ signal }) => repository.artifactReviews(artifact.id, signal),
    enabled: Boolean(manifest.data),
  });
  const editorHealth = useQuery({
    queryKey: queryKeys.key('document-editor-health'),
    queryFn: ({ signal }) => repository.documentEditorHealth(signal),
    enabled: Boolean(manifest.data?.embedded_editors.length),
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
        queryKey: queryKeys.key('artifact-reviews', artifact.id),
      });
    },
  });
  const rendition = useMutation({
    mutationFn: async () => repository.createDocumentRendition(artifact.id, artifact.session_id),
    onSuccess: (result) => {
      setOverrideManifest(result.artifact);
      setStatus(
        `Showing a derived PDF created by ${result.converter}; the original remains canonical.`,
      );
    },
  });
  const createWorkingCopy = useMutation({
    mutationFn: async (provider: 'native' | 'onlyoffice' | 'collabora') => {
      const copy = await repository.createDocumentWorkingCopy(artifact.id, {
        session_id: artifact.session_id,
        provider,
        writable: true,
        auto_checkpoint: true,
      });
      if (provider === 'native') {
        const opened = await openDocumentWorkingCopy(copy.path);
        if (!opened) await copyText(copy.path);
        return { kind: 'native' as const, copy, opened };
      }
      const launched = await repository.createDocumentEditorSession(copy.id, provider);
      return { kind: 'embedded' as const, copy, launched };
    },
    onSuccess: (result) => {
      setWorkingCopy(result.copy);
      if (result.kind === 'embedded') {
        setEditor(result.launched);
        setStatus(
          result.launched.status === 'ready'
            ? `${editorLabel(result.launched.provider)} editing session ready.`
            : result.launched.error || `${editorLabel(result.launched.provider)} is unavailable.`,
        );
      } else {
        setStatus(
          result.opened
            ? 'Opened in the system editor. Stable saves become immutable revisions.'
            : 'Working-copy path copied. Open it in a desktop editor to begin.',
        );
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
    <section aria-label="Document workspace" className="grid min-w-0 gap-3 overflow-hidden">
      <Tabs className="grid min-w-0 gap-3 overflow-hidden" defaultValue="preview">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2">
          <div className="mr-auto min-w-0">
            <p className="text-sm font-medium">{profileLabel(effectiveManifest)}</p>
            <p className="truncate font-mono text-[10px] text-muted-foreground">
              {effectiveManifest
                ? `Version ${effectiveManifest.version}, ${effectiveManifest.sha256.slice(0, 12)}`
                : manifest.error
                  ? 'Preview only; review and editing unavailable.'
                  : 'Checking document capabilities…'}
            </p>
          </div>
          <TooltipProvider delayDuration={240}>
            <TabsList aria-label="Document details" className="h-8 shrink-0" variant="default">
              <DocumentDetailTab
                icon={<BookOpenIcon aria-hidden="true" />}
                label="Read document"
                value="preview"
              />
              <DocumentDetailTab
                icon={<MessageSquareTextIcon aria-hidden="true" />}
                label={`Reviews${reviews.data?.length ? `, ${reviews.data.length}` : ''}`}
                value="reviews"
              />
              <DocumentDetailTab
                icon={<ShieldCheckIcon aria-hidden="true" />}
                label="Document safety"
                value="policy"
              />
            </TabsList>
          </TooltipProvider>
          {selection ? (
            <Button onClick={() => setReviewOpen(true)} size="sm" variant="secondary">
              <MessageSquareTextIcon aria-hidden="true" /> Review selection
            </Button>
          ) : null}
          {manifest.data?.native_open ? (
            <Button
              disabled={createWorkingCopy.isPending}
              onClick={() => createWorkingCopy.mutate('native')}
              size="sm"
              variant="outline"
            >
              Open in desktop app
            </Button>
          ) : null}
          {manifest.data?.embedded_editors.map((provider) => (
            <Button
              disabled={createWorkingCopy.isPending}
              key={provider}
              onClick={() => createWorkingCopy.mutate(provider)}
              size="sm"
              variant="outline"
            >
              Edit in {editorLabel(provider)}
            </Button>
          ))}
          {manifest.data?.rendition_formats.includes('pdf') &&
          !directProfiles.has(manifest.data.profile) ? (
            <Button
              disabled={rendition.isPending}
              onClick={() => rendition.mutate()}
              size="sm"
              variant="outline"
            >
              <FileOutputIcon aria-hidden="true" />
              {rendition.isPending ? 'Rendering…' : 'Render PDF preview'}
            </Button>
          ) : null}
          <Button
            aria-label="Refresh document revision"
            onClick={() => {
              setOverrideManifest(undefined);
              void Promise.all([manifest.refetch(), reviews.refetch()]);
            }}
            size="icon-sm"
            variant="ghost"
          >
            <RefreshCwIcon aria-hidden="true" />
          </Button>
        </div>
        {status ? <ClioStatus detail={status} label="Document updated" value="healthy" /> : null}
        {manifest.error ? (
          <Alert>
            <CircleAlertIcon aria-hidden="true" />
            <AlertTitle>Preview only</AlertTitle>
            <AlertDescription>
              <p>
                This saved result remains readable, but comments, revision history, and editing are
                unavailable because its original registered revision could not be loaded.
              </p>
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer font-medium">Technical details</summary>
                <code className="mt-1 block break-all">{manifest.error.message}</code>
              </details>
            </AlertDescription>
          </Alert>
        ) : null}
        {createWorkingCopy.error || rendition.error ? (
          <Alert variant="destructive">
            <AlertTitle>Document action failed</AlertTitle>
            <AlertDescription>
              {(createWorkingCopy.error ?? rendition.error)?.message}
            </AlertDescription>
          </Alert>
        ) : null}
        <WorkingCopyStatus
          closePending={closeWorkingCopy.isPending}
          copy={workingCopy}
          onClose={() => closeWorkingCopy.mutate()}
          onResolve={(resolution) => resolveConflict.mutate(resolution)}
          resolvePending={resolveConflict.isPending}
        />
        <TabsContent className="m-0 min-w-0 overflow-hidden" value="preview">
          <div
            className="min-w-0 overflow-hidden"
            ref={previewRef}
            onMouseUp={captureTextSelection}
          >
            <DocumentPreview
              content={content.data}
              editor={editor}
              fallback={fallbackPreview}
              manifest={effectiveManifest}
              onPdfSelection={setSelection}
              text={textContent}
            />
          </div>
        </TabsContent>
        <TabsContent className="m-0 min-w-0 overflow-hidden" value="reviews">
          <ReviewTimeline error={reviews.error?.message} reviews={reviews.data} />
        </TabsContent>
        <TabsContent className="m-0 min-w-0 overflow-hidden" value="policy">
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

function DocumentDetailTab({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <TabsTrigger aria-label={label} className="size-7 flex-none p-0" value={value}>
          {icon}
          <span className="sr-only">{label}</span>
        </TabsTrigger>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

function DocumentPreview({
  content,
  editor,
  fallback,
  manifest,
  onPdfSelection,
  text,
}: {
  content?: Uint8Array;
  editor?: DocumentEditorSession;
  fallback: ReactNode;
  manifest?: DocumentManifest;
  onPdfSelection: (anchor: DocumentAnchor) => void;
  text?: string;
}) {
  if (editor?.status === 'ready' && editor.editor_url) {
    return editor.provider === 'onlyoffice' ? (
      <ClioOnlyOfficeEditor config={editor.config} editorUrl={editor.editor_url} />
    ) : (
      <iframe
        className="h-[70vh] min-h-[540px] w-full rounded-lg border bg-background"
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-forms allow-same-origin allow-downloads allow-popups"
        src={editor.editor_url}
        title="Collabora document editor"
      />
    );
  }
  if (!manifest) return fallback;
  if (manifest.profile === 'pdf') {
    return content ? (
      <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading PDF viewer…</p>}>
        <ClioDocumentPdfViewer bytes={content} name={manifest.name} onSelection={onPdfSelection} />
      </Suspense>
    ) : (
      <p className="p-4 text-sm text-muted-foreground">Loading immutable PDF…</p>
    );
  }
  if (manifest.profile === 'markdown' && text !== undefined) {
    return (
      <article className="min-h-72 rounded-lg border bg-background p-5">
        <MessageResponse>{text}</MessageResponse>
      </article>
    );
  }
  if (['latex', 'html-static'].includes(manifest.profile) && text !== undefined) {
    return (
      <CodeBlock
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
          Open it in a desktop editor, use an available embedded editor, or create a read-only PDF
          rendition. No browser conversion has been invented.
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
            <p className="mt-1 font-mono text-[10px]">Revision {review.artifact_version}</p>
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
          <p className="font-mono text-[10px]">
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
