import type { MemoryDocument } from '@clio/core/v3';
import { DownloadIcon, HistoryIcon, SearchIcon } from 'lucide-react';
import { createElement, forwardRef, useEffect, useState, type Ref } from 'react';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Skeleton } from '@/components/ui/skeleton';
import { DeleteIcon } from '@/lib/icon-vocabulary';
import { SEARCH_DEBOUNCE_MS } from '@/lib/runtime-limits';
import {
  factCountLabel,
  liveFactCount,
  memoryCategoryIcon,
  memoryDocumentTitle,
  memoryScopeTitle,
  useMemoryDocumentExport,
} from './memory-document-helpers';
import { MemoryErrorLine } from './memory-error-line';
import { IconButton } from './primitives/icon-button';
import { ItemList, ItemRow } from './primitives/item-row';
import { ShortcutKeys } from './primitives/key-chip';
import { StateView } from './primitives/state-view';
import { SettingsGroupLabel } from './settings-row';

function DocumentRow({
  document,
  selected,
  onOpen,
  onHistory,
  onDelete,
  onExport,
  exporting,
}: {
  document: MemoryDocument;
  selected: boolean;
  onOpen: () => void;
  onHistory: () => void;
  onDelete: () => void;
  onExport: () => void;
  exporting: boolean;
}) {
  const title = memoryDocumentTitle(document);
  return (
    <ItemRow
      actions={
        <span className="relative z-10 flex items-center gap-px">
          <IconButton icon={<HistoryIcon />} label="History" onClick={onHistory} size="sm" />
          <IconButton
            disabled={exporting}
            icon={<DownloadIcon />}
            label="Export"
            onClick={onExport}
            size="sm"
          />
          <IconButton icon={<DeleteIcon />} label="Delete" onClick={onDelete} size="sm" />
        </span>
      }
      actionsWidth={92}
      icon={createElement(memoryCategoryIcon(document.category))}
      meta={factCountLabel(liveFactCount(document))}
      selected={selected}
      title={
        <button
          aria-current={selected || undefined}
          className="max-w-full truncate text-left outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-1 focus-visible:after:ring-ring focus-visible:after:ring-inset"
          onClick={onOpen}
          title={title}
          type="button"
        >
          {title}
        </button>
      }
    />
  );
}

function MemorySearchField({
  inputRef,
  onSearch,
}: {
  inputRef: Ref<HTMLInputElement>;
  onSearch: (text: string) => void;
}) {
  // Keystrokes re-render only this field; the list filters once typing pauses.
  const [text, setText] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => onSearch(text), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [onSearch, text]);
  return (
    <div className="py-2">
      {/* The spec's search field (.xsr): 30 px, outlined, 12.5 px faint text, 14 px icon. */}
      <InputGroup className="h-[1.875rem] rounded-[7px] dark:bg-transparent">
        <InputGroupAddon className="[&>svg:not([class*='size-'])]:size-3.5">
          <SearchIcon aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          aria-label="Search memories"
          className="text-[12.5px] placeholder:text-faint md:text-[12.5px]"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && text) {
              event.stopPropagation();
              setText('');
              onSearch('');
            }
          }}
          placeholder="Search memories"
          ref={inputRef}
          value={text}
        />
        <InputGroupAddon align="inline-end">
          <ShortcutKeys id="memory-search" variant="inline" />
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}

/** The Memories tab list: a search field, then documents grouped by account and workspace. */
export const MemoryDocuments = forwardRef<
  HTMLInputElement,
  {
    documents?: MemoryDocument[];
    pending: boolean;
    error?: Error | null;
    onRetry: () => void;
    /** Show one scope only (`user` or `project/<id>`), from the page address. */
    scope?: string;
    workspaceNames: ReadonlyMap<string, string>;
    opened: string;
    onOpen: (name: string, tab?: 'facts' | 'history') => void;
    onDelete: (document: MemoryDocument) => void;
    onCreate: () => void;
  }
>(function MemoryDocuments(
  { documents, pending, error, onRetry, scope, workspaceNames, opened, onOpen, onDelete, onCreate },
  searchRef,
) {
  const [filter, setFilter] = useState('');
  const exportOne = useMemoryDocumentExport();
  const needle = filter.trim().toLowerCase();
  const filtered = (documents ?? []).filter(
    (document) =>
      (!scope || document.scope === scope) &&
      (!needle ||
        [
          document.slug,
          document.description,
          ...document.facts.filter((fact) => fact.live).map((fact) => fact.text),
        ].some((text) => text.toLowerCase().includes(needle))),
  );
  const scopes = [...new Set(filtered.map((document) => document.scope))].sort((a, b) =>
    a === 'user'
      ? -1
      : b === 'user'
        ? 1
        : memoryScopeTitle(a, workspaceNames).localeCompare(memoryScopeTitle(b, workspaceNames)),
  );
  return (
    <div className="grid min-w-0">
      <MemorySearchField inputRef={searchRef} onSearch={setFilter} />
      {pending ? <Skeleton className="mt-2 h-32 w-full" /> : null}
      {error ? (
        <MemoryErrorLine error={error} onRetry={onRetry} what="Memories could not be loaded." />
      ) : null}
      {!error && documents && !documents.length ? (
        <StateView
          action={{ label: 'Create a memory', onClick: onCreate }}
          kind="empty"
          size="row"
          title="No memories saved yet"
        />
      ) : null}
      {documents?.length && !filtered.length ? (
        <StateView
          kind="empty"
          size="row"
          title={needle ? `No memories match “${filter.trim()}”` : 'No memories in this scope'}
        />
      ) : null}
      {scopes.map((group) => {
        const label = memoryScopeTitle(group, workspaceNames);
        return (
          <section aria-label={label} className="min-w-0" key={group}>
            <SettingsGroupLabel>{label}</SettingsGroupLabel>
            <ItemList label={`${label} memories`}>
              {filtered
                .filter((document) => document.scope === group)
                .map((document) => (
                  <DocumentRow
                    document={document}
                    exporting={exportOne.isPending && exportOne.variables === document.name}
                    key={document.name}
                    onDelete={() => onDelete(document)}
                    onExport={() => exportOne.mutate(document.name)}
                    onHistory={() => onOpen(document.name, 'history')}
                    onOpen={() => onOpen(document.name)}
                    selected={opened === document.name}
                  />
                ))}
            </ItemList>
          </section>
        );
      })}
    </div>
  );
});
