import type { FileUIPart } from 'ai';
import { lazy, Suspense, useEffect, useState } from 'react';
import {
  Attachment,
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

const LocalPdfViewer = lazy(() =>
  import('./document-pdf-viewer').then((module) => ({
    default: module.ClioDocumentPdfViewer,
  })),
);

/** Compact AI Elements attachment tray backed by PromptInput file state. */
export function ClioComposerAttachments() {
  const attachments = usePromptInputAttachments();
  const [preview, setPreview] = useState<(FileUIPart & { id: string }) | undefined>();
  if (attachments.files.length === 0) return null;

  return (
    <>
      <Attachments className="ml-0 w-full justify-start px-2.5 pb-1.5 pt-2" variant="grid">
        {attachments.files.map((file) => (
          <Attachment
            className="h-24 w-44 bg-muted/35"
            data={file}
            key={file.id}
            onRemove={() => attachments.remove(file.id)}
          >
            <button
              aria-label={`Open ${file.filename ?? 'attachment'}`}
              className="grid size-full grid-rows-[minmax(0,1fr)_auto] text-left"
              onClick={() => setPreview(file)}
              type="button"
            >
              <AttachmentPreview className="h-full w-full rounded-none [&_svg]:size-6" />
              <span className="min-w-0 border-t bg-background/85 px-2 py-1.5">
                <span className="block truncate text-xs font-medium">
                  {file.filename ?? 'Attachment'}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {file.mediaType || 'Type pending'}
                </span>
              </span>
            </button>
            <AttachmentRemove className="opacity-100" />
          </Attachment>
        ))}
      </Attachments>
      <Dialog onOpenChange={(open) => !open && setPreview(undefined)} open={Boolean(preview)}>
        <DialogContent className="grid h-[min(46rem,calc(100dvh-2rem))] max-w-5xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0">
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
    return (
      <iframe
        className="size-full min-h-[36rem] rounded-lg border bg-background"
        src={file.url}
        title={file.filename ?? 'Attachment preview'}
      />
    );
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
