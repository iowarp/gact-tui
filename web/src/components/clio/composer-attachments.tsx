import type { FileUIPart } from 'ai';
import { lazy, Suspense, useEffect, useState } from 'react';
import {
  Attachment,
  AttachmentHoverCard,
  AttachmentHoverCardContent,
  AttachmentHoverCardTrigger,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from '@/components/ai-elements/attachments';
import { usePromptInputAttachments } from '@/components/ai-elements/prompt-input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ResourceUploadProgress } from '@/lib/upload-workspace-resources';
import {
  summarizeResourcePipelineStages,
  type ResourcePipelineStages,
} from './resource-availability';
import {
  ResourcePipelineStatusLines,
  ResourcePipelineSummaryIcon,
} from './resource-pipeline-status';

const LocalPdfViewer = lazy(() =>
  import('./document-pdf-viewer').then((module) => ({
    default: module.ClioDocumentPdfViewer,
  })),
);

const MAX_TEXT_PREVIEW_BYTES = 1024 * 1024;

/** A rejected upload, reported against the attachment it was carrying. */
export interface ResourceUploadFailure {
  filename?: string;
  message: string;
}

/** Compact AI Elements attachment tray backed by PromptInput file state. */
export function ClioComposerAttachments({
  uploadFailure,
  uploadProgress,
}: {
  uploadFailure?: ResourceUploadFailure;
  uploadProgress?: ResourceUploadProgress;
}) {
  const attachments = usePromptInputAttachments();
  const [preview, setPreview] = useState<(FileUIPart & { id: string }) | undefined>();
  if (attachments.files.length === 0) return null;

  return (
    <>
      <Attachments className="ml-0 w-full justify-start px-2.5 pb-1.5 pt-2" variant="inline">
        {attachments.files.map((file) => {
          const filename = file.filename ?? 'Attachment';
          const stages = localAttachmentStages(file, uploadProgress, uploadFailure);
          return (
            <AttachmentHoverCard closeDelay={100} key={file.id} openDelay={220}>
              <AttachmentHoverCardTrigger asChild>
                <Attachment
                  className="h-8 max-w-52 gap-0 p-0"
                  data={file}
                  onRemove={() => attachments.remove(file.id)}
                >
                  <button
                    aria-label={`Open ${filename}`}
                    className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pl-1.5 text-left"
                    onClick={() => setPreview(file)}
                    type="button"
                  >
                    <AttachmentPreview className="size-5 [&_svg]:size-3" />
                    <AttachmentInfo className="max-w-28 text-xs" />
                    <ResourcePipelineSummaryIcon stages={stages} />
                  </button>
                  <AttachmentRemove />
                </Attachment>
              </AttachmentHoverCardTrigger>
              <AttachmentHoverCardContent className="max-w-72 border bg-popover p-3 shadow-md">
                <p className="truncate text-sm font-medium">{filename}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {file.mediaType || 'Media type pending'}
                </p>
                <div className="mt-2">
                  <ResourcePipelineStatusLines stages={stages} />
                </div>
              </AttachmentHoverCardContent>
            </AttachmentHoverCard>
          );
        })}
      </Attachments>
      <Dialog onOpenChange={(open) => !open && setPreview(undefined)} open={Boolean(preview)}>
        <DialogContent className="grid h-[min(46rem,calc(100dvh-2rem))] w-[min(64rem,calc(100vw-2rem))] max-w-none grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0 sm:max-w-none">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle className="truncate">
              {preview?.filename ?? 'Attachment preview'}
            </DialogTitle>
            <DialogDescription>{preview?.mediaType || 'Detected after upload'}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto bg-muted/25 p-4">
            {preview ? <LocalAttachmentPreview file={preview} /> : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function localAttachmentStages(
  file: FileUIPart,
  uploadProgress?: ResourceUploadProgress,
  uploadFailure?: ResourceUploadFailure,
): ResourcePipelineStages {
  if (uploadFailure && uploadFailure.filename === file.filename) {
    // Without this a rejected upload keeps reading as a healthy "Ready locally"
    // attachment, which is the opposite of what happened.
    return summarizeResourcePipelineStages(
      { detail: uploadFailure.message, kind: 'failed', label: 'Failed', name: 'Upload' },
      { kind: 'waiting', label: 'Waiting for upload', name: 'Conversion' },
    );
  }
  const progress = uploadProgress?.filename === file.filename ? uploadProgress : undefined;
  const upload =
    progress && progress.loaded < progress.total
      ? {
          detail:
            progress.total > 0
              ? `${Math.round((progress.loaded / progress.total) * 100)}%`
              : undefined,
          kind: 'active' as const,
          label: 'In progress',
          name: 'Upload' as const,
        }
      : {
          kind: 'complete' as const,
          label: progress ? 'Complete' : 'Ready locally',
          name: 'Upload' as const,
        };
  const conversion = {
    kind: 'waiting' as const,
    label: progress ? 'Waiting for workspace' : 'Starts after submission',
    name: 'Conversion' as const,
  };
  return summarizeResourcePipelineStages(upload, conversion);
}

function LocalAttachmentPreview({ file }: { file: FileUIPart }) {
  if (file.mediaType?.startsWith('image/')) {
    return (
      <img
        alt={file.filename ?? 'Attachment preview'}
        className="mx-auto max-h-full max-w-full rounded-lg object-contain"
        src={file.url}
      />
    );
  }
  if (file.mediaType?.startsWith('video/')) {
    return <video className="size-full rounded-lg object-contain" controls src={file.url} />;
  }
  if (file.mediaType?.startsWith('audio/')) {
    return <audio className="w-full" controls src={file.url} />;
  }
  if (file.mediaType === 'application/pdf') {
    return <LocalPdfPreview file={file} />;
  }
  if (
    file.mediaType?.startsWith('text/') ||
    /\.(md|mdx|py|js|jsx|ts|tsx|json|ya?ml|toml|csv|log)$/i.test(file.filename ?? '')
  ) {
    return <LocalTextPreview file={file} />;
  }
  return (
    <div className="grid h-full min-h-64 place-items-center text-center text-sm text-muted-foreground">
      <div>
        <p className="font-medium text-foreground">Preview unavailable</p>
        <p>This file will be preserved and inspected by the workspace after upload.</p>
      </div>
    </div>
  );
}

function LocalTextPreview({ file }: { file: FileUIPart }) {
  const [text, setText] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    void fetch(file.url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Preview request failed with ${response.status}.`);
        return response.blob();
      })
      .then((blob) => {
        if (blob.size > MAX_TEXT_PREVIEW_BYTES) {
          throw new Error('Preview unavailable for text files larger than 1 MB.');
        }
        return blob.text();
      })
      .then(setText)
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === 'AbortError') return;
        setError(cause instanceof Error ? cause.message : 'The text file could not be read.');
      });
    return () => controller.abort();
  }, [file.url]);

  if (error) {
    return <p className="p-4 text-sm text-destructive">{error}</p>;
  }
  if (text === undefined) {
    return <p className="p-4 text-sm text-muted-foreground">Loading preview…</p>;
  }
  return (
    <pre className="min-h-full whitespace-pre-wrap rounded-lg border bg-background p-4 font-mono text-xs leading-relaxed text-foreground">
      {text}
    </pre>
  );
}

function LocalPdfPreview({ file }: { file: FileUIPart }) {
  const [bytes, setBytes] = useState<Uint8Array>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    void fetch(file.url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Preview request failed with ${response.status}.`);
        return response.arrayBuffer();
      })
      .then((buffer) => setBytes(new Uint8Array(buffer)))
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === 'AbortError') return;
        setError(cause instanceof Error ? cause.message : 'The PDF could not be read.');
      });
    return () => controller.abort();
  }, [file.url]);

  if (error) {
    return <p className="p-4 text-sm text-destructive">{error}</p>;
  }
  if (!bytes) {
    return <p className="p-4 text-sm text-muted-foreground">Loading PDF…</p>;
  }
  return (
    <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading PDF…</p>}>
      <LocalPdfViewer
        bytes={bytes}
        name={file.filename ?? 'Attachment'}
        onSelection={() => undefined}
      />
    </Suspense>
  );
}
