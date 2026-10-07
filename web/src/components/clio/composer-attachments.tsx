import { toast } from 'sonner';
import type { WorkspaceResource } from '@clio/core/v3';
import type { FileUIPart } from 'ai';
import { CameraIcon, ChevronDownIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MarkdownText } from '@/components/ai-elements/markdown';
import {
  Attachment,
  AttachmentHoverCard,
  AttachmentHoverCardContent,
  AttachmentHoverCardTrigger,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
  getMediaCategory,
} from '@/components/ai-elements/attachments';
import { usePromptInputAttachments } from '@/components/ai-elements/prompt-input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { ComposerAnnotation, RegionCaptureAnnotation } from '@/lib/composer-annotations';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RemoveIcon } from '@/lib/icon-vocabulary';
import {
  readAttachmentBytes,
  type ResourceUploadProgress,
  type UploadableFilePart,
  type WorkspaceResourceUploadResult,
} from '@/lib/upload-workspace-resources';
import {
  resourcePipelineStages,
  summarizeResourcePipelineStages,
  type ResourcePipelineStages,
} from './resource-availability';
import {
  ResourcePipelineStatusLines,
  ResourcePipelineSummaryIcon,
} from './resource-pipeline-status';
import { AttachmentPreviewCarousel } from './attachment-preview-carousel';
import { ClioPdfPreview } from './pdf-preview';

const MAX_TEXT_PREVIEW_BYTES = 1024 * 1024;

/** A rejected upload, reported against the attachment it was carrying. */
export interface ResourceUploadFailure {
  filename?: string;
  message: string;
}

/** Adaptive AI Elements attachment tray backed by PromptInput file state. */
export function ClioComposerAttachments({
  annotations = [],
  onRemoveCapture,
  onPrepareFiles,
  onDiscardFiles,
  resources = [],
  uploadFailure,
  uploadProgress,
}: {
  annotations?: readonly ComposerAnnotation[];
  onRemoveCapture?: (annotation: RegionCaptureAnnotation) => void;
  onDiscardFiles?: (files: readonly UploadableFilePart[]) => Promise<void>;
  onPrepareFiles?: (
    files: readonly UploadableFilePart[],
    onProgress?: (progress: ResourceUploadProgress) => void,
    signal?: AbortSignal,
  ) => Promise<WorkspaceResourceUploadResult>;
  resources?: readonly WorkspaceResource[];
  uploadFailure?: ResourceUploadFailure;
  uploadProgress?: ResourceUploadProgress;
}) {
  const attachments = usePromptInputAttachments();
  const captureByFilename = new Map(
    annotations
      .filter(
        (annotation): annotation is RegionCaptureAnnotation => annotation.kind === 'region-capture',
      )
      .map((annotation) => [annotation.filename, annotation]),
  );
  useEffect(() => {
    const addCapture = (event: Event) => {
      const file = (event as CustomEvent<{ file?: File }>).detail?.file;
      if (file) attachments.add([file]);
    };
    window.addEventListener('clio:add-region-capture', addCapture);
    return () => window.removeEventListener('clio:add-region-capture', addCapture);
  }, [attachments]);
  const [previewId, setPreviewId] = useState<string>();
  const preparingAttachmentIds = useRef(new Set<string>());
  const preparationControllers = useRef(new Map<string, AbortController>());
  const [attachmentProgress, setAttachmentProgress] = useState<
    Record<string, ResourceUploadProgress>
  >({});
  const [attachmentFailures, setAttachmentFailures] = useState<
    Record<string, ResourceUploadFailure>
  >({});
  const [preparedResources, setPreparedResources] = useState<Record<string, WorkspaceResource>>({});

  useEffect(() => {
    const attachedIds = new Set(attachments.files.map((file) => file.id));
    for (const [id, controller] of preparationControllers.current) {
      if (attachedIds.has(id)) continue;
      controller.abort();
      preparationControllers.current.delete(id);
    }
  }, [attachments.files]);

  useEffect(
    () => () => {
      for (const controller of preparationControllers.current.values()) controller.abort();
      preparationControllers.current.clear();
    },
    [],
  );

  useEffect(() => {
    if (!onPrepareFiles) return;
    for (const file of attachments.files) {
      if (preparingAttachmentIds.current.has(file.id) || preparedResources[file.id]) continue;
      preparingAttachmentIds.current.add(file.id);
      const controller = new AbortController();
      preparationControllers.current.set(file.id, controller);
      setAttachmentFailures((current) => {
        if (!(file.id in current)) return current;
        const next = { ...current };
        delete next[file.id];
        return next;
      });
      void onPrepareFiles(
        [file],
        (progress) => {
          if (!controller.signal.aborted) {
            setAttachmentProgress((current) => ({ ...current, [file.id]: progress }));
          }
        },
        controller.signal,
      )
        .then((result) => {
          const resource = result.resources[0];
          if (resource && !controller.signal.aborted) {
            setPreparedResources((current) => ({ ...current, [file.id]: resource }));
          }
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setAttachmentFailures((current) => ({
            ...current,
            [file.id]: {
              filename: file.filename,
              message: error instanceof Error ? error.message : 'The upload failed.',
            },
          }));
        })
        .finally(() => {
          preparingAttachmentIds.current.delete(file.id);
          if (preparationControllers.current.get(file.id) === controller) {
            preparationControllers.current.delete(file.id);
          }
        });
    }
  }, [attachments.files, onPrepareFiles, preparedResources]);

  const removeFile = async (file: (typeof attachments.files)[number]) => {
    preparationControllers.current.get(file.id)?.abort();
    preparationControllers.current.delete(file.id);
    try {
      await onDiscardFiles?.([file]);
      attachments.remove(file.id);
    } catch (error) {
      toast.error('Could not remove attachment', {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const preview = attachments.files.find((file) => file.id === previewId);
  const previewItems = useMemo(
    () =>
      attachments.files.map((file) => ({
        id: file.id,
        label: file.filename ?? 'Attachment',
        renderPreview: () => (
          <div className="size-full min-h-0 overflow-auto bg-muted/25 p-4">
            <LocalAttachmentPreview file={file} />
          </div>
        ),
        renderThumbnail: () => (
          <Attachment className="size-full" data={file}>
            <AttachmentPreview />
          </Attachment>
        ),
      })),
    [attachments.files],
  );

  if (attachments.files.length === 0) return null;

  return (
    <>
      <ScrollArea className="h-auto w-full max-w-full rounded-2xl" type="auto">
        <Attachments
          aria-label="Pending attachments"
          className="w-max min-w-full justify-start gap-3 p-3"
          role="group"
          variant="composer"
        >
          {attachments.files.map((file) => {
            const filename = file.filename ?? 'Attachment';
            const capture = captureByFilename.get(filename);
            const mediaCategory = getMediaCategory(file);
            const visual = mediaCategory === 'image' || mediaCategory === 'video';
            const prepared = preparedResources[file.id];
            const resource =
              resources.find((candidate) => candidate.id === prepared?.id) ?? prepared;
            const stages = resource
              ? resourcePipelineStages(resource)
              : localAttachmentStages(
                  file,
                  attachmentProgress[file.id] ?? uploadProgress,
                  attachmentFailures[file.id] ?? uploadFailure,
                  Boolean(onPrepareFiles),
                );
            if (capture) {
              return (
                <div
                  className="flex min-w-0 w-full items-center gap-2 rounded-lg border bg-muted/40 px-2 py-2"
                  key={file.id}
                >
                  <button
                    aria-label={`Open ${filename}`}
                    className="size-14 shrink-0 overflow-hidden rounded border bg-background"
                    onClick={() => setPreviewId(file.id)}
                    type="button"
                  >
                    <Attachment className="size-full" data={file}>
                      <AttachmentPreview />
                    </Attachment>
                  </button>
                  <CameraIcon aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.6875rem] font-medium text-muted-foreground">
                      {capture.title}
                    </p>
                    <p className="truncate text-xs text-foreground">{capture.summary}</p>
                  </div>
                  <ResourcePipelineSummaryIcon stages={stages} />
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        aria-label={`Show the full ${capture.title} reference`}
                        className="size-6 shrink-0"
                        size="icon"
                        title="Show details"
                        type="button"
                        variant="ghost"
                      >
                        <ChevronDownIcon aria-hidden="true" className="size-3.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="end"
                      className="max-h-96 w-[26rem] max-w-[calc(100vw-2rem)] overflow-y-auto text-xs"
                    >
                      <MarkdownText mode="static">{capture.markdown}</MarkdownText>
                    </PopoverContent>
                  </Popover>
                  <Button
                    aria-label={`Remove ${capture.title}`}
                    className="size-6 shrink-0"
                    onClick={() => {
                      void removeFile(file).then(() => onRemoveCapture?.(capture));
                    }}
                    size="icon"
                    title="Remove"
                    type="button"
                    variant="ghost"
                  >
                    <RemoveIcon aria-hidden="true" className="size-3.5" />
                  </Button>
                </div>
              );
            }
            return (
              <AttachmentHoverCard closeDelay={100} key={file.id} openDelay={220}>
                <AttachmentHoverCardTrigger asChild>
                  <Attachment data={file} onRemove={() => void removeFile(file)}>
                    <button
                      aria-label={`Open ${filename}`}
                      className={cn(
                        'text-left',
                        visual ? 'size-full' : 'flex size-full min-w-0 flex-col overflow-hidden',
                      )}
                      onClick={() => setPreviewId(file.id)}
                      type="button"
                    >
                      <AttachmentPreview />
                      <AttachmentInfo className="text-xs" showMediaType />
                      <span className="absolute right-2 bottom-2 shrink-0">
                        <ResourcePipelineSummaryIcon overlay stages={stages} />
                      </span>
                    </button>
                    <AttachmentRemove aria-label={`Remove ${filename}`} />
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
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      <Dialog onOpenChange={(open) => !open && setPreviewId(undefined)} open={Boolean(preview)}>
        <DialogContent
          className={cn(
            'grid max-w-none grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0 sm:max-w-none',
            preview?.mediaType === 'application/pdf'
              ? 'h-[calc(100dvh-1rem)] w-[min(90rem,calc(100vw-1rem))]'
              : 'h-[min(46rem,calc(100dvh-2rem))] w-[min(64rem,calc(100vw-2rem))]',
          )}
        >
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle className="truncate">
              {preview?.filename ?? 'Attachment preview'}
            </DialogTitle>
            <DialogDescription>{preview?.mediaType || 'Detected after upload'}</DialogDescription>
          </DialogHeader>
          {preview ? (
            <AttachmentPreviewCarousel
              className="min-h-0 p-3"
              items={previewItems}
              onValueChange={setPreviewId}
              value={preview.id}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function localAttachmentStages(
  file: FileUIPart,
  uploadProgress?: ResourceUploadProgress,
  uploadFailure?: ResourceUploadFailure,
  preparing = false,
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
          kind: preparing ? ('active' as const) : ('complete' as const),
          label: progress ? 'Complete' : preparing ? 'Starting' : 'Ready locally',
          name: 'Upload' as const,
        };
  const conversion = {
    kind: 'waiting' as const,
    label: 'Waiting for upload',
    name: 'Conversion' as const,
  };
  return summarizeResourcePipelineStages(upload, conversion);
}

function LocalAttachmentPreview({ file }: { file: UploadableFilePart }) {
  if (file.mediaType?.startsWith('image/')) {
    return (
      <img
        alt={file.filename ?? 'Attachment preview'}
        className="size-full rounded-lg object-contain"
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

function LocalTextPreview({ file }: { file: UploadableFilePart }) {
  const [text, setText] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    void readAttachmentBytes(file, controller.signal)
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
    // Re-reads only when the attachment identity itself changes; `file` is a
    // fresh object every render (it flows straight from React state), so
    // depending on it directly would re-fetch on every unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.url, file.file]);

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

function LocalPdfPreview({ file }: { file: UploadableFilePart }) {
  const [bytes, setBytes] = useState<Uint8Array>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    void readAttachmentBytes(file, controller.signal)
      .then((blob) => blob.arrayBuffer())
      .then((buffer) => setBytes(new Uint8Array(buffer)))
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === 'AbortError') return;
        setError(cause instanceof Error ? cause.message : 'The PDF could not be read.');
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.url, file.file]);

  return (
    <ClioPdfPreview bytes={bytes} error={error} fit="page" name={file.filename ?? 'Attachment'} />
  );
}
