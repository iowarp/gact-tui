import type {
  ContextFile,
  ContextFrame,
  ContextSnapshot,
  SessionContextPolicy,
} from '@clio/core/v3';
import { FileTextIcon, ShieldCheckIcon, SparklesIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ClioContextMeter } from './context-meter';
import { ClioInteractiveRow } from './interactive-row';

interface ClioContextCanvasPanelProps {
  compactPending?: boolean;
  context?: ContextSnapshot;
  error?: string;
  files: readonly ContextFile[];
  frames: readonly ContextFrame[];
  onCompact?: () => Promise<unknown>;
  onOpenFile?: (path: string) => void;
  policy?: SessionContextPolicy;
}

export function ClioContextCanvasPanel({
  compactPending,
  context,
  error,
  files,
  frames,
  onCompact,
  onOpenFile,
  policy,
}: ClioContextCanvasPanelProps) {
  const latest = frames.at(-1);
  const reading = context?.used_tokens ?? context?.live_tokens;
  const canCompact = Boolean(onCompact && context?.live_block_count);
  return (
    <div className="grid gap-4">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Live context unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {context?.limit_tokens && reading !== undefined ? (
        <section className="grid gap-3" aria-label="Working context usage">
          <ClioContextMeter limit={context.limit_tokens} used={reading} />
          <div className="grid gap-1 text-xs">
            <ContextRow label="Scope" value={context.scope ?? 'Unavailable'} />
            <ContextRow
              label="Live blocks"
              value={context.live_block_count?.toLocaleString() ?? 'Unavailable'}
            />
            <ContextRow
              label="Automatic compaction"
              value={
                context.autocompact_pct === undefined
                  ? 'Unavailable'
                  : `${Math.round(context.autocompact_pct * 100)}% of the context window`
              }
            />
            <ContextRow label="Observed by" value={context.provenance.source} />
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Context categories">
            {Object.entries(context.categories ?? {}).map(([category, tokens]) => (
              <Badge key={category} variant="outline">
                {category.replaceAll('_', ' ')}, {tokens.toLocaleString()} tokens
              </Badge>
            ))}
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={!canCompact || compactPending} variant="outline">
                <SparklesIcon aria-hidden="true" />
                {compactPending ? 'Compacting context…' : 'Compact working context'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Summarize the live working context?</AlertDialogTitle>
                <AlertDialogDescription>
                  The service will replace the current live blocks with one faithful summary. The
                  retained transcript and context frames remain available as provenance.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep current blocks</AlertDialogCancel>
                <AlertDialogAction onClick={() => void onCompact?.()}>
                  Compact now
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {!canCompact ? (
            <p className="text-xs text-muted-foreground">
              There are no live blocks to compact in this scope.
            </p>
          ) : null}
        </section>
      ) : (
        <p className="p-6 text-center text-sm text-muted-foreground">
          Context usage is unavailable from this service.
        </p>
      )}

      {policy ? (
        <Alert>
          <ShieldCheckIcon aria-hidden="true" />
          <AlertTitle>Session-only working context</AlertTitle>
          <AlertDescription className="grid gap-2">
            <p>
              Reads and writes stay inside this session. Cross-session recall
              {policy.cross_session_read_available ? ' is available' : ' is unavailable'} and
              {policy.requires_user_consent
                ? ' requires explicit user intent.'
                : ' follows service policy.'}
            </p>
            <ul className="list-disc space-y-1 pl-4">
              {policy.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <section aria-labelledby="retained-context-heading">
        <h3 className="text-xs font-medium" id="retained-context-heading">
          Latest retained context
        </h3>
        {latest ? (
          <div className="mt-2 grid gap-2">
            <div className="grid gap-1 rounded-lg border p-3 text-xs">
              <ContextRow label="State" value={latest.status.replaceAll('_', ' ')} />
              <ContextRow label="Included items" value={latest.items.length.toLocaleString()} />
              <ContextRow
                label="Estimated tokens"
                value={latest.tokens_estimated.toLocaleString()}
              />
              <ContextRow label="Observed" value={formatTimestamp(latest.updated_at)} />
            </div>
            {latest.items.slice(0, 8).map((item, index) => {
              const title = item.display_path ?? item.path ?? item.role ?? item.kind;
              const detail = `${item.included ? 'Included' : 'Excluded'}, ${item.tokens_estimated.toLocaleString()} estimated tokens${item.reason ? `, ${item.reason}` : ''}`;
              return item.path && onOpenFile ? (
                <ClioInteractiveRow
                  key={`${item.source_id ?? item.path}:${index}`}
                  onClick={() => onOpenFile(item.path!)}
                  role="button"
                >
                  <p className="truncate text-xs font-medium">{title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
                </ClioInteractiveRow>
              ) : (
                <div className="rounded-lg border p-3 text-xs" key={`${title}:${index}`}>
                  <p className="font-medium">{title}</p>
                  <p className="mt-1 text-muted-foreground">{detail}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            No retained context frame is available.
          </p>
        )}
      </section>

      <section aria-labelledby="context-files-heading">
        <h3 className="flex items-center gap-2 text-xs font-medium" id="context-files-heading">
          <FileTextIcon aria-hidden="true" className="size-3.5" /> Attached files
        </h3>
        <div className="mt-2 grid gap-2">
          {files.length ? (
            files.map((file) => (
              <ClioInteractiveRow
                key={file.path}
                onClick={onOpenFile ? () => onOpenFile(file.path) : undefined}
                role={onOpenFile ? 'button' : undefined}
              >
                <p className="truncate text-xs font-medium">{file.display_path}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {file.mode === 'edit' ? 'Editable' : file.mode === 'pin' ? 'Pinned' : 'Read only'}
                  {file.language ? `, ${file.language}` : ''}
                </p>
              </ClioInteractiveRow>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">
              No files are attached to this session context.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
