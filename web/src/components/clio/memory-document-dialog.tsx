import { refreshAfterMemoryRemoval } from '@/lib/memory-cache';
import { memoryChanges } from '@/lib/memory-changes';
import { MemoryFactChanges } from './memory-fact-changes';
import type { MemoryDocument, MemoryFact, MemoryVersion } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, HistoryIcon } from 'lucide-react';
import { CloseIcon, DeleteIcon, EditIcon } from '@/lib/icon-vocabulary';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useRepository } from '@/hooks/use-repository';
import { cn } from '@/lib/utils';
import { MemorySourceIcon } from './memory-source';
import { MEMORY_CATEGORY_LABELS } from './memory-presentation';

type SessionHref = (sessionId: string) => string | undefined;

function FactRow({
  document,
  fact,
  sessionHref,
  onRemoved,
  highlighted = false,
}: {
  document: MemoryDocument;
  fact: MemoryFact;
  sessionHref: SessionHref;
  onRemoved: () => void;
  /** Opened from a conversation's memory notice: scrolled to and marked. */
  highlighted?: boolean;
}) {
  const row = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (highlighted) row.current?.scrollIntoView?.({ block: 'center' });
  }, [highlighted]);
  const repository = useRepository();
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(fact.text);
  const refresh = () => void client.invalidateQueries({ queryKey: ['memory'] });
  const edit = useMutation({
    mutationFn: () =>
      repository.editMemoryFact(document.name, fact.id, {
        fact: text,
        expected_sha: document.sha,
      }),
    onSuccess: () => {
      setEditing(false);
      refresh();
      toast.success('Fact corrected');
    },
  });
  const forget = useMutation({
    mutationFn: () => repository.forgetMemoryFact(document.name, fact.id, document.sha),
    onSuccess: (result) => {
      if ('removed' in result) {
        toast.success('Memory forgotten');
        onRemoved();
        void refreshAfterMemoryRemoval(client, document.name);
      } else {
        refresh();
        toast.success('Fact forgotten');
      }
    },
  });
  return (
    <li
      aria-current={highlighted ? 'true' : undefined}
      className={cn(
        'flex items-start gap-2 py-1.5',
        highlighted && '-mx-2 rounded-md bg-accent px-2 ring-1 ring-primary/60',
      )}
      ref={row}
    >
      <MemorySourceIcon fact={fact} sessionHref={sessionHref(fact.session)} />
      {editing ? (
        <form
          className="flex min-w-0 flex-1 gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (text.trim()) edit.mutate();
          }}
        >
          <Input
            aria-label="Corrected fact"
            onChange={(event) => setText(event.target.value)}
            value={text}
          />
          <Button aria-label="Save correction" disabled={edit.isPending} size="icon" type="submit">
            <CheckIcon aria-hidden="true" />
          </Button>
          <Button
            aria-label="Cancel correction"
            onClick={() => setEditing(false)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <CloseIcon aria-hidden="true" />
          </Button>
        </form>
      ) : (
        <>
          <p className="min-w-0 flex-1 text-sm leading-6">{fact.text}</p>
          <Button
            aria-label={`Correct “${fact.text}”`}
            onClick={() => setEditing(true)}
            size="icon"
            variant="ghost"
          >
            <EditIcon aria-hidden="true" />
          </Button>
          <Button
            aria-label={`Forget “${fact.text}”`}
            disabled={forget.isPending}
            onClick={() => forget.mutate()}
            size="icon"
            variant="ghost"
          >
            <DeleteIcon aria-hidden="true" />
          </Button>
        </>
      )}
      {edit.error || forget.error ? (
        <p className="text-xs text-destructive" role="alert">
          {(edit.error ?? forget.error)?.message}
        </p>
      ) : null}
    </li>
  );
}

/** One document: its live facts (editable), with superseded ones collapsed below. */
export function MemoryDocumentDialog({
  name,
  open,
  onOpenChange,
  sessionHref,
  highlight = '',
  scopeLabel,
}: {
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionHref: SessionHref;
  /** A fact id to scroll to and mark (from a memory notice's "Edit in memory"). */
  highlight?: string;
  scopeLabel?: string;
}) {
  const repository = useRepository();
  const document = useQuery({
    queryKey: ['memory', 'document', name],
    queryFn: ({ signal }) => repository.memoryDocument(name, signal),
    enabled: open,
  });
  const live = document.data?.facts.filter((fact) => fact.live) ?? [];
  const superseded = document.data?.facts.filter((fact) => !fact.live) ?? [];
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{document.data?.description || document.data?.slug || 'Memory'}</DialogTitle>
          <DialogDescription>
            {document.data
              ? (scopeLabel ??
                (document.data.scope === 'user'
                  ? 'Account memory'
                  : `Workspace memory: ${document.data.scope.replace('project/', '')}`))
              : 'Loading…'}
          </DialogDescription>
        </DialogHeader>
        {document.isPending ? <Skeleton className="h-24 w-full" /> : null}
        {document.error ? (
          <Alert variant="destructive">
            <AlertTitle>Memory unavailable</AlertTitle>
            <AlertDescription>{document.error.message}</AlertDescription>
          </Alert>
        ) : null}
        {document.data ? (
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-1.5">
              {(document.data.description || document.data.slug) !==
              (MEMORY_CATEGORY_LABELS[document.data.category] ?? document.data.category) ? (
                <Badge variant="outline">
                  {MEMORY_CATEGORY_LABELS[document.data.category] ?? document.data.category}
                </Badge>
              ) : null}
              {document.data.aliases.map((alias) => (
                <Badge key={alias} variant="secondary">
                  {alias}
                </Badge>
              ))}
            </div>
            {live.length ? (
              <ul aria-label="Facts" className="divide-y">
                {live.map((fact) => (
                  <FactRow
                    document={document.data}
                    fact={fact}
                    highlighted={fact.id === highlight}
                    key={fact.id}
                    onRemoved={() => onOpenChange(false)}
                    sessionHref={sessionHref}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No facts yet.</p>
            )}
            {superseded.length ? (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">
                  {superseded.length} replaced {superseded.length === 1 ? 'fact' : 'facts'}
                </summary>
                <ul className="mt-2 grid gap-1">
                  {superseded.map((fact) => (
                    <li className="flex items-start gap-2 text-muted-foreground" key={fact.id}>
                      <MemorySourceIcon fact={fact} sessionHref={sessionHref(fact.session)} />
                      <span className="line-through">{fact.text}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Fact-level changes shared with the conversation's inline memory results. */
export function MemoryDiff({ before, after }: { before: string; after: string }) {
  const changes = useMemo(() => memoryChanges(before, after), [before, after]);
  return <MemoryFactChanges changes={changes} />;
}

function authorLabel(version: MemoryVersion) {
  const kind = version.author.kind ?? '';
  if (kind === 'tool_call') return 'Asked in a conversation';
  if (kind === 'proposal') return 'Accepted proposal';
  if (kind === 'user_edit') return 'Edited on the memory page';
  if (kind === 'import') return 'Imported';
  if (kind === 'restore') return 'Restored';
  return 'Change';
}

/** A document's versions, each diffed against the current text, with restore. */
export function MemoryHistoryDialog({
  name,
  open,
  onOpenChange,
}: {
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const repository = useRepository();
  const client = useQueryClient();
  const versions = useQuery({
    queryKey: ['memory', 'versions', name],
    queryFn: ({ signal }) => repository.memoryVersions(name, signal),
    enabled: open,
  });
  const current = useQuery({
    queryKey: ['memory', 'document', name],
    queryFn: ({ signal }) => repository.memoryDocument(name, signal),
    enabled: open,
    retry: false,
  });
  const [selected, setSelected] = useState<number>();
  const restore = useMutation({
    mutationFn: (version: number) => repository.restoreMemoryVersion(name, version),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['memory'] });
      toast.success('Version restored');
    },
  });
  const list = [...(versions.data ?? [])].reverse();
  const chosen = list.find((version) => version.n === selected) ?? list[0];
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HistoryIcon aria-hidden="true" className="size-4" /> History
          </DialogTitle>
          <DialogDescription>{name}</DialogDescription>
        </DialogHeader>
        {versions.isPending ? <Skeleton className="h-24 w-full" /> : null}
        <div className="grid gap-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
          <ol aria-label="Versions" className="grid content-start gap-1">
            {list.map((version) => (
              <li key={version.n}>
                <Button
                  aria-pressed={chosen?.n === version.n}
                  className="h-auto w-full flex-col items-start gap-0.5 py-2 text-left"
                  onClick={() => setSelected(version.n)}
                  variant={chosen?.n === version.n ? 'secondary' : 'ghost'}
                >
                  <span className="text-sm">{authorLabel(version)}</span>
                  <time className="text-xs font-normal text-muted-foreground" dateTime={version.at}>
                    {new Date(version.at).toLocaleString()}
                  </time>
                </Button>
              </li>
            ))}
          </ol>
          {chosen ? (
            <div className="grid content-start gap-3">
              <p className="text-sm text-muted-foreground">
                The document before this change, compared with the current one.
              </p>
              <MemoryDiff after={current.data?.text ?? ''} before={chosen.text} />
              {chosen.text ? (
                <Button
                  className="w-fit"
                  disabled={restore.isPending}
                  onClick={() => restore.mutate(chosen.n)}
                  variant="outline"
                >
                  Restore this version
                </Button>
              ) : null}
              {restore.error ? (
                <p className="text-sm text-destructive" role="alert">
                  {restore.error.message}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
