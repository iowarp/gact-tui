import type { SessionDiff } from '@clio/core/v3';
import { Undo2Icon } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { TooltipProvider } from '@/components/ui/tooltip';
import { FrameCommentsUnavailable } from './comments/frame-comments';
import { DiffLines } from './diff-lines';
import { fileViewerReference } from './file-viewer-location';
import type { FileViewerSource } from './file-viewer-source';
import { FrameTalkTake } from './file-viewer-take';
import {
  useAddToMessage,
  useCopyTake,
  useFileViewerCrumbs,
  useOpenTake,
} from './file-viewer-take-hooks';
import { FrameBar, FrameCrumbs } from './primitives/frame-bar';
import { IconButton } from './primitives/icon-button';
import { StateView } from './primitives/state-view';
import { t, ph } from '@lingui/core/macro';

export interface DiffCanvasViewProps {
  diff: SessionDiff;
  error?: string;
  pending?: boolean;
  /** The workspace the changed file is in, for @ Add to message and its paths. */
  workspaceId?: string;
  onOpenFile: (path: string) => void;
  onUndo: (changeId: string) => Promise<unknown>;
}

/**
 * The record of one file change the agent made, with the person's Undo. Its
 * frame bar names the file, says what changed ("Changed", "+24 −3"), offers
 * Undo, @ Add to message, Copy ▾ (the diff and the file's paths) and Open ▾.
 */
export function DiffCanvasView({
  diff,
  error,
  pending,
  workspaceId,
  onOpenFile,
  onUndo,
}: DiffCanvasViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [undoOpen, setUndoOpen] = useState(false);
  const source: FileViewerSource = {
    kind: 'workspace',
    path: diff.path,
    mediaType: 'text/plain',
    workspaceId: workspaceId ?? '',
  };
  const unified = diff.unified_diff;
  const crumbs = useFileViewerCrumbs(source);
  const copy = useCopyTake(source, unified ? () => unified : undefined);
  const open = useOpenTake(source, [], { tab: () => onOpenFile(diff.path) });
  const addToMessage = useAddToMessage(
    workspaceId ? fileViewerReference(source) : undefined,
    workspaceId,
    hostRef,
  );
  const { added, removed } = diffLineCounts(unified);
  const undoReason = pending
    ? t`Undoing…`
    : diff.status === 'applied' && diff.undo_available
      ? undefined
      : undoNote(diff);
  return (
    <div ref={hostRef} data-slot="diff-view" className="flex h-full min-h-0 flex-col">
      <TooltipProvider delayDuration={200}>
        <FrameBar
          label={t`Change`}
          where={
            <span className="flex min-w-0 items-center gap-1.5">
              <FrameCrumbs parts={crumbs.length ? crumbs : [{ label: diff.path }]} />
            </span>
          }
          what={
            <>
              <span>{diffStatusLabel(diff)}</span>
              {unified ? (
                <span className="tabular-nums" aria-label={t`${added} added, ${removed} removed`}>
                  +{added} −{removed}
                </span>
              ) : null}
            </>
          }
          format={
            <IconButton
              label={t`Undo this change`}
              icon={<Undo2Icon aria-hidden="true" />}
              disabledReason={undoReason}
              className="[&_svg]:size-3.5"
              onClick={() => setUndoOpen(true)}
            />
          }
          actions={
            <FrameTalkTake
              addToMessage={addToMessage}
              comments={<FrameCommentsUnavailable reason={t`Not available for a change`} />}
              copy={copy}
              open={open}
              pending={pending}
            />
          }
        />
      </TooltipProvider>
      <h2 className="sr-only">
        {diff.created ? t`File created by the agent` : t`File changed by the agent`}
      </h2>
      {error ? (
        <Alert className="m-3 w-auto" variant="destructive">
          <AlertTitle>{t`The change was not undone`}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {unified ? (
        <DiffLines className="flex-1" unified={unified} />
      ) : (
        <StateView
          className="flex-1 p-6"
          kind="unavailable"
          size="panel"
          title={t`Diff content unavailable`}
        />
      )}
      {undoReason && !pending ? (
        <p
          className="shrink-0 truncate border-t px-3 py-1.5 text-xs text-muted-foreground"
          title={undoReason}
        >
          {undoReason}
        </p>
      ) : null}
      <UndoChange
        diff={diff}
        open={undoOpen}
        onOpenChange={setUndoOpen}
        onConfirm={() => onUndo(diff.id)}
      />
    </div>
  );
}

/** Added and removed lines of a unified diff, without its file headers. */
function diffLineCounts(unified: string | undefined) {
  let added = 0;
  let removed = 0;
  for (const line of unified?.split('\n') ?? []) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) added += 1;
    else if (line.startsWith('-')) removed += 1;
  }
  return { added, removed };
}

function UndoChange({
  diff,
  open,
  onOpenChange,
  onConfirm,
}: {
  diff: SessionDiff;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<unknown>;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t`Undo this file change?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {diff.created
              ? t`The service will delete ${ph({ path: diff.path })}, which the agent created.`
              : t`The service will put ${ph({ path: diff.path })} back as it was before this change.`}{' '}
            {t`It refuses if the file changed after the agent wrote it.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t`Keep the change`}</AlertDialogCancel>
          <AlertDialogAction
            // A refusal is shown in the "The change was not undone" alert, from the
            // undo mutation's error state; the rejected promise needs no second report.
            onClick={() => void onConfirm().catch(() => undefined)}
            variant="destructive"
          >
            {t`Undo`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
const UNDO_UNAVAILABLE_NOTES: Record<string, string> = {
  previous_content_too_large: t`Undo is not available: the file was over 256 KiB before this change.`,
  previous_content_not_text: t`Undo is not available: the file was not UTF-8 text before this change.`,
  previous_content_unreadable: t`Undo is not available: the file could not be read before this change.`,
  file_changed_before_write: t`Undo is not available: the file changed while the write waited for approval.`,
  previous_content_not_captured: t`Undo is not available: the previous content was not captured.`,
  not_on_server_record: t`Undo is not available: this change is no longer on the service record (for example, after a restart).`,
};

function undoNote(diff: SessionDiff): string {
  if (diff.status === 'reverted') return t`This change was undone.`;
  const reason = diff.undo_unavailable_reason ?? '';
  return (
    UNDO_UNAVAILABLE_NOTES[reason] ??
    (reason ? t`Undo is not available (${reason}).` : t`Undo is not available.`)
  );
}

function diffStatusLabel(diff: SessionDiff): string {
  if (diff.status === 'reverted') return t`Undone`;
  return diff.created ? t`Created` : t`Changed`;
}
