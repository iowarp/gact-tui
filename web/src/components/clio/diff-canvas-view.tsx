import type { SessionDiff } from '@clio/core/v3';
import { FileCode2Icon, FileDiffIcon, Undo2Icon } from 'lucide-react';
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@/components/ai-elements/code-block';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ClioStatus } from './status';

export interface DiffCanvasViewProps {
  diff: SessionDiff;
  error?: string;
  pending?: boolean;
  onOpenFile: (path: string) => void;
  onUndo: (changeId: string) => Promise<unknown>;
}

/** The record of one file change the agent made, with the person's Undo. */
export function DiffCanvasView({ diff, error, pending, onOpenFile, onUndo }: DiffCanvasViewProps) {
  return (
    <ScrollArea className="h-full p-3">
      <div className="grid gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-card p-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <FileDiffIcon aria-hidden="true" className="size-4 text-primary" />
              {diff.created ? 'File created by the agent' : 'File changed by the agent'}
            </p>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{diff.path}</p>
          </div>
          <ClioStatus label={diffStatusLabel(diff)} value={diffStatusValue(diff)} />
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>The change was not undone</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <CodeBlock code={diff.unified_diff || 'Diff content unavailable.'} language="diff" showLineNumbers>
          <CodeBlockHeader>
            <CodeBlockTitle>
              <FileDiffIcon aria-hidden="true" className="size-3.5" />
              <CodeBlockFilename>{diff.path}</CodeBlockFilename>
            </CodeBlockTitle>
            <CodeBlockActions>
              <Button
                aria-label={`Open ${diff.path}`}
                onClick={() => onOpenFile(diff.path)}
                size="icon-xs"
                title="Open current file"
                variant="ghost"
              >
                <FileCode2Icon aria-hidden="true" />
              </Button>
              {diff.unified_diff ? <CodeBlockCopyButton aria-label={`Copy diff for ${diff.path}`} /> : null}
            </CodeBlockActions>
          </CodeBlockHeader>
        </CodeBlock>

        {diff.status === 'applied' && diff.undo_available ? (
          <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
            <UndoChange diff={diff} disabled={pending} onConfirm={() => onUndo(diff.id)} />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{undoNote(diff)}</p>
        )}
      </div>
    </ScrollArea>
  );
}

function UndoChange({
  diff,
  disabled,
  onConfirm,
}: {
  diff: SessionDiff;
  disabled?: boolean;
  onConfirm: () => Promise<unknown>;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button disabled={disabled} variant="outline">
          <Undo2Icon aria-hidden="true" />
          Undo
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Undo this file change?</AlertDialogTitle>
          <AlertDialogDescription>
            {diff.created
              ? `The service will delete ${diff.path}, which the agent created.`
              : `The service will put ${diff.path} back as it was before this change.`}{' '}
            It refuses if the file changed after the agent wrote it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep the change</AlertDialogCancel>
          <AlertDialogAction
            // A refusal is shown in the "The change was not undone" alert, from the
            // undo mutation's error state; the rejected promise needs no second report.
            onClick={() => void onConfirm().catch(() => undefined)}
            variant="destructive"
          >
            Undo
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const UNDO_UNAVAILABLE_NOTES: Record<string, string> = {
  previous_content_too_large: 'Undo is not available: the file was over 256 KiB before this change.',
  previous_content_not_text: 'Undo is not available: the file was not UTF-8 text before this change.',
  previous_content_unreadable: 'Undo is not available: the file could not be read before this change.',
  file_changed_before_write:
    'Undo is not available: the file changed while the write waited for approval.',
  previous_content_not_captured: 'Undo is not available: the previous content was not captured.',
  not_on_server_record:
    'Undo is not available: this change is no longer on the service record (for example, after a restart).',
};

function undoNote(diff: SessionDiff): string {
  if (diff.status === 'reverted') return 'This change was undone.';
  const reason = diff.undo_unavailable_reason ?? '';
  return UNDO_UNAVAILABLE_NOTES[reason] ?? `Undo is not available${reason ? ` (${reason})` : ''}.`;
}

function diffStatusValue(diff: SessionDiff): 'succeeded' | 'cancelled' {
  return diff.status === 'reverted' ? 'cancelled' : 'succeeded';
}

function diffStatusLabel(diff: SessionDiff): string {
  if (diff.status === 'reverted') return 'Undone';
  return diff.created ? 'Created' : 'Changed';
}
