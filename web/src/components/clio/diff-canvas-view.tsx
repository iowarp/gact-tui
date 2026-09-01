import type { SessionDiff } from '@clio/core/v3';
import { FileCode2Icon, FileDiffIcon } from 'lucide-react';
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
  onApply: (path: string) => Promise<unknown>;
  onOpenFile: (path: string) => void;
  onReject: (path: string) => Promise<unknown>;
}

/** Review surface for an authoritative server-owned file diff. */
export function DiffCanvasView({
  diff,
  error,
  pending,
  onApply,
  onOpenFile,
  onReject,
}: DiffCanvasViewProps) {
  const reviewable = diff.status === 'pending';
  return (
    <ScrollArea className="h-full p-3">
      <div className="grid gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-card p-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <FileDiffIcon aria-hidden="true" className="size-4 text-primary" />
              Review file change
            </p>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{diff.path}</p>
          </div>
          <ClioStatus label={diffStatusLabel(diff.status)} value={diffStatusValue(diff)} />
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>File change was not updated</AlertTitle>
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

        {reviewable ? (
          <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
            <DiffDecision
              action="reject"
              disabled={pending}
              onConfirm={() => onReject(diff.path)}
              path={diff.path}
            />
            <DiffDecision
              action="apply"
              disabled={pending}
              onConfirm={() => onApply(diff.path)}
              path={diff.path}
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            This review is settled. The source file remains available as a separate canvas tab.
          </p>
        )}
      </div>
    </ScrollArea>
  );
}

function DiffDecision({
  action,
  disabled,
  onConfirm,
  path,
}: {
  action: 'apply' | 'reject';
  disabled?: boolean;
  onConfirm: () => Promise<unknown>;
  path: string;
}) {
  const applying = action === 'apply';
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button disabled={disabled} variant={applying ? 'default' : 'outline'}>
          {applying ? 'Apply change' : 'Reject change'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{applying ? 'Apply this file change?' : 'Reject this file change?'}</AlertDialogTitle>
          <AlertDialogDescription>
            {applying
              ? `The service will write the reviewed change to ${path} through the workspace permission boundary.`
              : `The proposed change to ${path} will be marked rejected and will not be written.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep reviewing</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => void onConfirm()}
            variant={applying ? 'default' : 'destructive'}
          >
            {applying ? 'Apply change' : 'Reject change'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function diffStatusValue(diff: SessionDiff): 'pending' | 'succeeded' | 'cancelled' | 'failed' {
  if (diff.applied || diff.status === 'applied') return 'succeeded';
  if (diff.status === 'rejected') return 'cancelled';
  if (diff.status === 'pending') return 'pending';
  return 'failed';
}

function diffStatusLabel(status: string): string {
  return status.replaceAll('_', ' ').replace(/\b\w/gu, (letter) => letter.toUpperCase());
}
