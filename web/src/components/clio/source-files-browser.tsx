import type { SourceEntry } from '@clio/core/v3';
import { ArrowUpIcon, FileIcon, FolderIcon, SearchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { sourceBytes } from './connected-source-labels';
import { InfoTip } from './info-tip';
import { IconButton } from './primitives/icon-button';
import { SegmentedControl } from './primitives/segmented-control';
import { SourceStatusLine, sourceInputClass } from './source-form-parts';

export type SourceFilesView = 'source' | 'downloads';

const quietAction = 'h-6 shrink-0 px-2 text-[12px] text-muted-foreground hover:text-foreground';

/**
 * A source's files in the form language: an 11.5px label with the Source /
 * Downloaded switch at its right, a 30px search with Up, then 28px rows of
 * name, mono size and one quiet action.
 */
export function SourceFilesBrowser({
  copies,
  copiesNote,
  view,
  onView,
  folder,
  search,
  offset,
  onGo,
  onSearch,
  onOffset,
  browse,
  addFolder,
  fileAction,
}: {
  /** Browsing the downloaded copy rather than the source. */
  copies: boolean;
  /** About the downloaded files, when browsing them. */
  copiesNote?: string;
  /** Offered when the source has both: its files and the downloaded copy. */
  view?: SourceFilesView;
  onView?: (view: SourceFilesView) => void;
  folder: string;
  search: string;
  offset: number;
  onGo: (folder: string) => void;
  onSearch: (search: string) => void;
  onOffset: (offset: number) => void;
  browse: {
    isPending: boolean;
    error: Error | null;
    data?: { entries: SourceEntry[]; next_offset?: number | null };
  };
  /** "Add this folder to message", when attaching. */
  addFolder?: { label: string; disabled: boolean; onClick: () => void };
  /** The one action a file row offers (Add to message, Download file). */
  fileAction: (
    entry: SourceEntry,
  ) => { label: string; disabled: boolean; onClick: () => void } | undefined;
}) {
  return (
    <section aria-label="Source files" className="flex min-w-0 flex-col gap-[5px]">
      <div className="flex min-h-7 min-w-0 items-center gap-1.5 text-[11.5px] whitespace-nowrap text-muted-foreground">
        {copies ? 'Downloaded files' : 'Files'}
        {copies && copiesNote ? (
          <InfoTip label="About approved inputs">{copiesNote}</InfoTip>
        ) : null}
        {view && onView ? (
          <SegmentedControl
            label="File location"
            className="ml-auto"
            value={view}
            onValueChange={onView}
            options={[
              { value: 'source', label: 'Source' },
              { value: 'downloads', label: 'Downloaded' },
            ]}
          />
        ) : null}
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        <IconButton
          icon={<ArrowUpIcon />}
          label="Parent source folder"
          size="toolbar"
          disabled={!folder}
          onClick={() => onGo(folder.split('/').slice(0, -1).join('/'))}
        />
        <div className="relative min-w-0 flex-1">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint"
          />
          <Input
            aria-label="Search source files"
            placeholder="Search files"
            className={cn(sourceInputClass, 'pl-8')}
            value={search}
            onChange={(event) => onSearch(event.target.value)}
          />
        </div>
      </div>
      {folder || addFolder ? (
        <div className="flex min-h-6 min-w-0 items-center gap-2 text-[11.5px]">
          {folder ? (
            <button
              type="button"
              className="min-w-0 truncate text-left font-mono text-[11px] text-muted-foreground hover:text-foreground"
              title={`Back to the top of the source from ${folder}`}
              onClick={() => onGo('')}
            >
              Source / {folder}
            </button>
          ) : null}
          {addFolder ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(quietAction, 'ml-auto')}
              disabled={addFolder.disabled}
              onClick={addFolder.onClick}
            >
              <FolderIcon aria-hidden="true" />
              {addFolder.label}
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="-mx-2 max-h-72 min-w-0 overflow-y-auto">
        {browse.isPending ? (
          <SourceStatusLine role="status" tone="quiet" className="px-2">
            Reading source files…
          </SourceStatusLine>
        ) : null}
        {browse.error ? (
          <SourceStatusLine role="alert" tone="error" className="px-2">
            {browse.error.message}
          </SourceStatusLine>
        ) : null}
        {browse.data?.entries.length === 0 ? (
          <SourceStatusLine tone="quiet" className="px-2">
            No matching files.
          </SourceStatusLine>
        ) : null}
        {browse.data?.entries.map((entry) => {
          const name = search ? entry.path : entry.path.split('/').at(-1);
          const act = entry.kind === 'file' ? fileAction(entry) : undefined;
          return (
            <div
              key={entry.path}
              className="flex h-7 min-w-0 items-center gap-2 rounded-[6px] px-2 text-[12.5px] whitespace-nowrap hover:bg-hover"
            >
              {entry.kind === 'directory' ? (
                <FolderIcon
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-muted-foreground"
                />
              ) : (
                <FileIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              {entry.kind === 'directory' ? (
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left hover:underline hover:underline-offset-4"
                  title={entry.path}
                  onClick={() => onGo(entry.path)}
                >
                  {name}
                </button>
              ) : (
                <span className="min-w-0 flex-1 truncate" title={entry.path}>
                  {name}
                </span>
              )}
              {entry.kind === 'file' ? (
                <span className="w-16 shrink-0 text-right font-mono text-[11px] text-faint tabular-nums">
                  {sourceBytes(entry.size)}
                </span>
              ) : null}
              {act ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={quietAction}
                  disabled={act.disabled}
                  onClick={act.onClick}
                >
                  {act.label}
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
      {offset > 0 || browse.data?.next_offset != null ? (
        <div className="flex justify-between">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={quietAction}
            disabled={offset === 0}
            onClick={() => onOffset(Math.max(0, offset - 100))}
          >
            Previous
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={quietAction}
            disabled={browse.data?.next_offset == null}
            onClick={() => onOffset(browse.data?.next_offset ?? 0)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </section>
  );
}
