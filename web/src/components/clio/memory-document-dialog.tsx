import { refreshAfterMemoryRemoval } from '@/lib/memory-cache';
import { memoryChanges } from '@/lib/memory-changes';
import type { MemoryDocument, MemoryFact, MemoryVersion } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, DownloadIcon, HistoryIcon } from 'lucide-react';
import { CloseIcon, DeleteIcon, EditIcon } from '@/lib/icon-vocabulary';
import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useRepository } from '@/hooks/use-repository';
import { cn } from '@/lib/utils';
import {
  liveFactCount,
  memoryCategoryIcon,
  memoryDocumentTitle,
  memoryErrorText,
  memoryTime,
  useMemoryDocumentExport,
} from './memory-document-helpers';
import { MemoryFactChanges } from './memory-fact-changes';
import { MemorySourceIcon } from './memory-source';
import { MEMORY_CATEGORY_LABELS } from './memory-presentation';
import { DetailPane } from './primitives/detail-pane';
import { DialogFrame } from './primitives/dialog-frame';
import { MemoryErrorLine } from './memory-error-line';
import { IconButton } from './primitives/icon-button';
import { ItemList, ItemRow } from './primitives/item-row';
import { KeyValueGrid } from './primitives/key-value-grid';
import { SegmentedControl } from './primitives/segmented-control';
import { Tag } from './primitives/tag';
import { proseInputProps } from '@/lib/identifier-input';
import { t, ph, plural } from '@lingui/core/macro';

type SessionHref = (sessionId: string) => string | undefined;
export type MemoryPaneTab = 'facts' | 'history';

function usageLabel(document: MemoryDocument) {
  const usage = document.usage;
  if (!usage || (!usage.read && !usage.loaded)) return t`Not used yet`;
  const parts: string[] = [];
  if (usage.read) parts.push(t`read ${ph({ count: usage.read })}×`);
  if (usage.loaded) parts.push(t`loaded ${ph({ count: usage.loaded })}×`);
  const used = parts.join(', ');
  return usage.last_read ? t`${used}; last ${ph({ date: usage.last_read.slice(0, 10) })}` : used;
}

/** Confirms deleting a whole document; the one destructive button in this section. */
export function MemoryDeleteDialog({
  document,
  onOpenChange,
  onDeleted,
}: {
  /** The document to delete; the frame is open while one is given. */
  document?: MemoryDocument;
  onOpenChange: (open: boolean) => void;
  onDeleted?: (name: string) => void;
}) {
  const repository = useRepository();
  const client = useQueryClient();
  const remove = useMutation({
    mutationFn: (target: MemoryDocument) =>
      repository.forgetMemoryDocument(target.name, target.sha),
    onSuccess: (_result, target) => {
      void refreshAfterMemoryRemoval(client, target.name);
      toast.success(t`Deleted ${ph({ title: memoryDocumentTitle(target) })}`);
      onOpenChange(false);
      onDeleted?.(target.name);
    },
    onError: (error) => toast.error(memoryErrorText(error)),
  });
  const live = document ? liveFactCount(document) : 0;
  return (
    <DialogFrame
      cancelLabel={t`Keep it`}
      confirm={{
        label: t`Delete`,
        tone: 'destructive',
        disabled: remove.isPending,
        onConfirm: () => {
          if (document) remove.mutate(document);
        },
      }}
      description={plural(live, {
        one: 'The agent forgets its fact and will not learn it again from past conversations.',
        other:
          'The agent forgets its # facts and will not learn them again from past conversations.',
      })}
      icon={<DeleteIcon />}
      onOpenChange={onOpenChange}
      open={Boolean(document)}
      title={
        document ? t`Delete ${ph({ title: memoryDocumentTitle(document) })}?` : t`Delete memory?`
      }
    />
  );
}

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
      toast.success(t`Fact corrected`);
    },
  });
  const forget = useMutation({
    mutationFn: () => repository.forgetMemoryFact(document.name, fact.id, document.sha),
    onSuccess: (result) => {
      if ('removed' in result) {
        toast.success(t`Memory forgotten`);
        onRemoved();
        void refreshAfterMemoryRemoval(client, document.name);
      } else {
        refresh();
        toast.success(t`Fact forgotten`);
      }
    },
  });
  const error = edit.error ?? forget.error;
  return (
    <li
      aria-current={highlighted ? 'true' : undefined}
      className={cn(
        'group/fact grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-start gap-x-1.5 border-b border-border/70 py-1',
        highlighted && 'bg-primary/10 shadow-[inset_2px_0_var(--color-primary)]',
      )}
      ref={row}
    >
      <MemorySourceIcon fact={fact} sessionHref={sessionHref(fact.session)} />
      {editing ? (
        <form
          className="col-span-2 flex min-w-0 items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (text.trim()) edit.mutate();
          }}
        >
          <Input
            {...proseInputProps}
            aria-label={t`Corrected fact`}
            autoFocus
            className="h-7 text-ui"
            onChange={(event) => setText(event.target.value)}
            value={text}
          />
          <IconButton
            disabled={edit.isPending}
            icon={<CheckIcon />}
            label={t`Save correction`}
            type="submit"
          />
          <IconButton
            icon={<CloseIcon />}
            label={t`Cancel correction`}
            onClick={() => setEditing(false)}
          />
        </form>
      ) : (
        <>
          <p className="min-w-0 py-0.5 leading-5 break-words">{fact.text}</p>
          <span className="invisible flex gap-px group-focus-within/fact:visible group-hover/fact:visible">
            <IconButton
              icon={<EditIcon />}
              label={t`Correct “${ph({ text: fact.text })}”`}
              onClick={() => setEditing(true)}
              size="sm"
            />
            <IconButton
              disabled={forget.isPending}
              icon={<DeleteIcon />}
              label={t`Forget “${ph({ text: fact.text })}”`}
              onClick={() => forget.mutate()}
              size="sm"
            />
          </span>
        </>
      )}
      {error ? (
        <p className="col-start-2 col-end-4 text-xs text-destructive" role="alert">
          {memoryErrorText(error)}
        </p>
      ) : null}
    </li>
  );
}

function DocumentFacts({
  document,
  highlight,
  scopeLabel,
  sessionHref,
  onRemoved,
}: {
  document: MemoryDocument;
  highlight: string;
  scopeLabel: string;
  sessionHref: SessionHref;
  onRemoved: () => void;
}) {
  const live = document.facts.filter((fact) => fact.live);
  const superseded = document.facts.filter((fact) => !fact.live);
  const category = MEMORY_CATEGORY_LABELS[document.category] ?? document.category;
  return (
    <div className="grid gap-3">
      <KeyValueGrid
        items={[
          { label: t`Kept in`, value: scopeLabel },
          { label: t`Category`, value: category },
          { label: t`Used`, value: usageLabel(document) },
          { label: t`Updated`, value: document.updated || t`Not recorded` },
        ]}
      />
      {document.aliases.length ? (
        <div aria-label={t`Also called`} className="flex min-w-0 flex-wrap gap-1" role="group">
          {document.aliases.map((alias) => (
            <Tag key={alias} width="auto">
              {alias}
            </Tag>
          ))}
        </div>
      ) : null}
      {live.length ? (
        <ul aria-label={t`Facts`} className="grid">
          {live.map((fact) => (
            <FactRow
              document={document}
              fact={fact}
              highlighted={fact.id === highlight}
              key={fact.id}
              onRemoved={onRemoved}
              sessionHref={sessionHref}
            />
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">{t`No facts yet.`}</p>
      )}
      {superseded.length ? (
        <details>
          <summary className="w-fit cursor-pointer text-muted-foreground">
            {plural(superseded.length, { one: '# replaced fact', other: '# replaced facts' })}
          </summary>
          <ul className="mt-1 grid gap-1">
            {superseded.map((fact) => (
              <li
                className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-x-1.5 text-muted-foreground"
                key={fact.id}
              >
                <MemorySourceIcon fact={fact} sessionHref={sessionHref(fact.session)} />
                <span className="py-0.5 leading-5 break-words line-through">{fact.text}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/** Fact-level changes shared with the conversation's inline memory results. */
export function MemoryDiff({ before, after }: { before: string; after: string }) {
  const changes = useMemo(() => memoryChanges(before, after), [before, after]);
  return <MemoryFactChanges changes={changes} />;
}

function authorLabel(version: MemoryVersion) {
  const kind = version.author.kind ?? '';
  if (kind === 'tool_call') return t`Asked in a conversation`;
  if (kind === 'proposal') return t`Accepted proposal`;
  if (kind === 'user_edit') return t`Edited on the memory page`;
  if (kind === 'import') return t`Imported`;
  if (kind === 'restore') return t`Restored`;
  return t({ message: 'Change', context: 'noun' });
}

/** A document's versions, each diffed against the current text, with restore. */
function MemoryHistory({ name, current }: { name: string; current: string }) {
  const repository = useRepository();
  const client = useQueryClient();
  const versions = useQuery({
    queryKey: ['memory', 'versions', name],
    queryFn: ({ signal }) => repository.memoryVersions(name, signal),
  });
  const [selected, setSelected] = useState<number>();
  const restore = useMutation({
    mutationFn: (version: number) => repository.restoreMemoryVersion(name, version),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['memory'] });
      toast.success(t`Version restored`);
    },
  });
  if (versions.isPending) return <Skeleton className="h-16 w-full" />;
  if (versions.error)
    return (
      <MemoryErrorLine
        error={versions.error}
        onRetry={() => void versions.refetch()}
        what={t`History could not be loaded.`}
      />
    );
  const list = [...versions.data].reverse();
  const chosen = list.find((version) => version.n === selected) ?? list[0];
  if (!chosen) return <p className="text-muted-foreground">{t`No earlier versions.`}</p>;
  return (
    <div className="grid gap-3">
      <ItemList label={t`Versions`}>
        {list.map((version) => (
          <ItemRow
            aria-pressed={chosen.n === version.n}
            className="cursor-pointer"
            icon={<HistoryIcon />}
            key={version.n}
            meta={<time dateTime={version.at}>{memoryTime(version.at)}</time>}
            onClick={() => setSelected(version.n)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setSelected(version.n);
              }
            }}
            role="button"
            selected={chosen.n === version.n}
            size="sm"
            tabIndex={0}
            title={authorLabel(version)}
          />
        ))}
      </ItemList>
      <p className="text-muted-foreground">
        {t`The document before this change, compared with the current one.`}
      </p>
      <MemoryDiff after={current} before={chosen.text} />
      {chosen.text ? (
        <Button
          className="w-fit"
          disabled={restore.isPending}
          onClick={() => restore.mutate(chosen.n)}
          size="sm"
          variant="outline"
        >
          {t`Restore this version`}
        </Button>
      ) : null}
      {restore.error ? (
        <p className="text-destructive" role="alert">
          {memoryErrorText(restore.error)}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One document beside the memory list: its live facts (editable), replaced
 * facts collapsed below, and its history with restore. Download and Delete sit
 * in the title row.
 */
export function MemoryDocumentPane({
  name,
  tab,
  onTabChange,
  onClose,
  onDelete,
  sessionHref,
  highlight = '',
  scopeLabel,
  onSessionIds,
}: {
  name: string;
  tab: MemoryPaneTab;
  onTabChange: (tab: MemoryPaneTab) => void;
  onClose: () => void;
  onDelete: (document: MemoryDocument) => void;
  sessionHref: SessionHref;
  /** The sessions the shown facts came from, so their links can be resolved. */
  onSessionIds?: (sessionIds: readonly string[]) => void;
  /** A fact id to scroll to and mark (from a memory notice's "Edit in memory"). */
  highlight?: string;
  scopeLabel: string;
}) {
  const repository = useRepository();
  const document = useQuery({
    queryKey: ['memory', 'document', name],
    queryFn: ({ signal }) => repository.memoryDocument(name, signal),
    retry: false,
  });
  const exportOne = useMemoryDocumentExport();
  useEffect(() => {
    if (document.data) onSessionIds?.(document.data.facts.map((fact) => fact.session));
  }, [document.data, onSessionIds]);
  const loaded = document.data;
  return (
    <DetailPane
      actions={
        loaded ? (
          <>
            <IconButton
              disabled={exportOne.isPending}
              icon={<DownloadIcon />}
              label={t`Download`}
              onClick={() => exportOne.mutate(loaded.name)}
            />
            <IconButton icon={<DeleteIcon />} label={t`Delete`} onClick={() => onDelete(loaded)} />
          </>
        ) : null
      }
      icon={createElement(memoryCategoryIcon(document.data?.category ?? ''))}
      onClose={onClose}
      tabs={
        <SegmentedControl
          label={t`Memory view`}
          onValueChange={onTabChange}
          options={[
            { value: 'facts', label: t`Facts` },
            { value: 'history', label: t`History` },
          ]}
          value={tab}
        />
      }
      title={loaded ? memoryDocumentTitle(loaded) : t`Memory`}
    >
      {document.isPending ? <Skeleton className="h-24 w-full" /> : null}
      {document.error ? (
        <MemoryErrorLine
          error={document.error}
          onRetry={() => void document.refetch()}
          what={t`This memory could not be loaded.`}
        />
      ) : null}
      {loaded && tab === 'facts' ? (
        <DocumentFacts
          document={loaded}
          highlight={highlight}
          onRemoved={onClose}
          scopeLabel={scopeLabel}
          sessionHref={sessionHref}
        />
      ) : null}
      {loaded && tab === 'history' ? <MemoryHistory current={loaded.text} name={name} /> : null}
    </DetailPane>
  );
}
