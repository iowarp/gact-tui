import { memo, useDeferredValue, useLayoutEffect, useMemo, useState } from 'react';
import { KeyboardIcon, SearchIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SHORTCUT_GROUPS, type ShortcutDefinition } from '@/lib/shortcuts/catalog';
import {
  KeyPlatformContext,
  useKeyPlatform,
  useShortcut,
  useShortcutList,
} from '@/lib/shortcuts/hooks';
import type { KeyPlatform } from '@/lib/shortcuts/keys';
import { activeShortcutIds } from '@/lib/shortcuts/registry';
import { cn } from '@/lib/utils';
import { ShortcutKeys } from './key-chip';
import { SegmentedControl } from './segmented-control';
import { StateView } from './state-view';

/** Column count by row count: the sheet grows to four columns only when it has the rows to fill them. */
const ROWS_PER_COLUMN = 10;
const SHEET_WIDTH = [
  '',
  'sm:w-[min(26rem,calc(100vw-2rem))]',
  'sm:w-[min(42rem,calc(100vw-2rem))]',
  'sm:w-[min(64rem,calc(100vw-2rem))]',
  'sm:w-[min(84rem,calc(100vw-2rem))]',
] as const;
const SHEET_COLUMNS = [
  '',
  '',
  '@xl:columns-2',
  '@xl:columns-2 @4xl:columns-3',
  '@xl:columns-2 @4xl:columns-3 @6xl:columns-4',
] as const;

const PLATFORM_OPTIONS = [
  { value: 'windows', label: 'Windows, Linux' },
  { value: 'mac', label: 'Mac' },
] as const satisfies readonly { value: KeyPlatform; label: string }[];

function ShortcutSheetBody({
  scope,
  onColumns,
}: {
  scope: 'active' | 'catalog';
  onColumns: (columns: number) => void;
}) {
  const detected = useKeyPlatform();
  const [platform, setPlatform] = useState<KeyPlatform>(detected);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const shortcuts = useShortcutList();
  // Read once per opening: the sheet lists the keys that work right now.
  const [active] = useState(() => (scope === 'active' ? activeShortcutIds() : undefined));
  const groups = useMemo(() => {
    const matches = (definition: ShortcutDefinition) =>
      (!active || active.has(definition.id) || definition.group === 'menu') &&
      (!deferredQuery || definition.name.toLowerCase().includes(deferredQuery));
    return SHORTCUT_GROUPS.map((group) => ({
      ...group,
      items: shortcuts.filter((definition) => definition.group === group.id && matches(definition)),
    })).filter((group) => group.items.length > 0);
  }, [shortcuts, deferredQuery, active]);
  // Sized by the unfiltered list so the sheet keeps its width while you type.
  const [columns] = useState(() => {
    const rows = shortcuts.filter(
      (definition) => !active || active.has(definition.id) || definition.group === 'menu',
    ).length;
    return Math.min(4, Math.max(1, Math.ceil(rows / ROWS_PER_COLUMN)));
  });
  useLayoutEffect(() => onColumns(columns), [columns, onColumns]);
  return (
    <KeyPlatformContext.Provider value={platform}>
      <div className="flex min-w-0 items-center gap-2 border-b border-border py-2 pr-12 pl-4">
        <KeyboardIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <DialogTitle className="min-w-0 flex-1 truncate text-[14px] [overflow-wrap:normal]">
          Keyboard shortcuts
        </DialogTitle>
        <DialogDescription className="sr-only">
          Every key, grouped by where it works.
        </DialogDescription>
        <SegmentedControl
          label="Show keys for"
          options={PLATFORM_OPTIONS}
          value={platform}
          onValueChange={setPlatform}
        />
      </div>
      <div className="relative border-b border-border px-4 py-2">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-6 size-3.5 -translate-y-1/2 text-faint"
        />
        <Input
          aria-label="Find a shortcut"
          placeholder="Find a shortcut"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-7 pl-7 text-[12.5px]"
        />
      </div>
      <div className="@container min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {groups.length === 0 ? (
          <StateView kind="empty" title="No shortcut matches" />
        ) : (
          <div className={cn('columns-1 gap-[30px]', SHEET_COLUMNS[columns])}>
            {groups.map((group) => (
              <section key={group.id} aria-label={group.label} className="mb-4 break-inside-avoid">
                <h3 className="mb-1 truncate text-[11px] font-semibold text-muted-foreground">
                  {group.label}
                </h3>
                <ul>
                  {group.items.map((definition) => (
                    <li
                      key={definition.id}
                      data-slot="shortcut-sheet-row"
                      className="flex h-[30px] min-w-0 items-center gap-3 border-b border-border/50 text-[12.5px] whitespace-nowrap last:border-b-0"
                    >
                      <span className="min-w-0 flex-1 truncate" title={definition.name}>
                        {definition.name}
                      </span>
                      <ShortcutKeys id={definition.id} variant="caps" />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </KeyPlatformContext.Provider>
  );
}

/**
 * Every registered key, grouped by where it works, in the platform's form
 * with a switch to read the other one. The body mounts only while open.
 */
export const ShortcutSheet = memo(function ShortcutSheet({
  open,
  onOpenChange,
  scope = 'active',
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * `active` lists keys with a handler mounted (and the menu keys every menu
   * has); `catalog` lists every planned key, for review.
   */
  scope?: 'active' | 'catalog';
  className?: string;
}) {
  const [columns, setColumns] = useState(2);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-frame="shortcut-sheet"
        className={cn(
          'top-1/2 flex max-h-[min(640px,calc(100dvh-2rem))] w-[calc(100vw-2rem)] max-w-none -translate-y-1/2 flex-col gap-0 overflow-hidden p-0 sm:max-w-none',
          SHEET_WIDTH[columns],
          className,
        )}
      >
        {open ? <ShortcutSheetBody scope={scope} onColumns={setColumns} /> : null}
      </DialogContent>
    </Dialog>
  );
});

/**
 * Opens the sheet on Ctrl+/ (⌘/). Mount once near the app root; the sheet's
 * content costs nothing until it opens.
 */
export function ShortcutSheetLauncher() {
  const [open, setOpen] = useState(false);
  useShortcut('shortcuts', () => setOpen((current) => !current));
  return <ShortcutSheet open={open} onOpenChange={setOpen} />;
}
