import { SearchIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { IconButton } from './primitives/icon-button';

/**
 * A tab list's search: a search icon for the list header (`WorkbenchTabList`'s
 * `actions`) that opens a filter field above the list. Escape or the icon closes
 * it and clears the query. `query` is empty while the field is closed.
 */
export function useWorkbenchListSearch(label: string) {
  const [searching, setSearching] = useState(false);
  const [text, setText] = useState('');
  const close = () => {
    setSearching(false);
    setText('');
  };
  const toggle = (
    <IconButton
      aria-pressed={searching}
      icon={<SearchIcon />}
      label={searching ? 'Close search' : label}
      onClick={() => (searching ? close() : setSearching(true))}
      size="sm"
      tooltipSide="bottom"
    />
  );
  const withField = (list: ReactNode) =>
    searching ? (
      <>
        <div className="flex h-9 shrink-0 items-center border-b border-border px-1.5">
          <Input
            aria-label={label}
            autoFocus
            className="h-7 text-xs"
            data-escape-owner=""
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;
              event.stopPropagation();
              close();
            }}
            placeholder={label}
            value={text}
          />
        </div>
        {list}
      </>
    ) : (
      list
    );
  return { query: searching ? text : '', toggle, withField };
}

/** Whether `text` holds the trimmed query, ignoring case. An empty query matches all. */
export function matchesListQuery(text: string, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  return !needle || text.toLocaleLowerCase().includes(needle);
}
