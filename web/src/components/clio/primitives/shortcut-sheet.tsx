import { memo, useCallback, useDeferredValue, useLayoutEffect, useMemo, useState } from 'react';
import { SearchIcon } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SHORTCUT_GROUPS, type ShortcutDefinition } from '@/lib/shortcuts/catalog';
import {
  KeyPlatformContext,
  useKeyPlatform,
  useShortcut,
  useShortcutList,
} from '@/lib/shortcuts/hooks';
import type { KeyPlatform } from '@/lib/shortcuts/keys';
import { activeShortcutIds, shortcutChords, shortcutLabels } from '@/lib/shortcuts/registry';
import { CloseIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { useMenuAction } from '@/tauri/menu-actions';
import { KeyCap, ShortcutKeys } from './key-chip';
import { SegmentedControl } from './segmented-control';
import { StateView } from './state-view';
import { formatLocale } from '@/lib/locale-format';
import { ph, t } from '@lingui/core/macro';

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
  { value: 'windows', label: t`Windows, Linux` },
  { value: 'mac', label: t`Mac` },
] as const satisfies readonly { value: KeyPlatform; label: string }[];

const WORKS_HERE = t`Works on this screen`;

/** Direction pairs share one row, as in the spec ("Previous, next conversation"). */
const PAIRS: Readonly<Record<string, { with: string; name: string }>> = {
  'previous-conversation': { with: 'next-conversation', name: t`Previous, next conversation` },
  'next-region': { with: 'previous-region', name: t`Next, previous region` },
  'previous-tab': { with: 'next-tab', name: t`Previous, next tab` },
};

interface SheetRow {
  id: string;
  name: string;
  /** When the key does this, if not always: the row's hover title. */
  when?: string;
  group: ShortcutDefinition['group'];
  ids: readonly string[];
  pair?: readonly [ShortcutDefinition, ShortcutDefinition];
}

function sheetRows(shortcuts: readonly ShortcutDefinition[], platform: KeyPlatform): SheetRow[] {
  const usable = shortcuts.filter((definition) => shortcutChords(definition, platform).length > 0);
  const byId = new Map(usable.map((definition) => [definition.id, definition]));
  const paired = new Set(
    Object.entries(PAIRS)
      .filter(([lead, pair]) => byId.has(lead) && byId.has(pair.with))
      .map(([, pair]) => pair.with),
  );
  return usable.flatMap((definition): SheetRow[] => {
    if (paired.has(definition.id)) return [];
    const pair = PAIRS[definition.id];
    const other = pair ? byId.get(pair.with) : undefined;
    return pair && other
      ? [
          {
            id: definition.id,
            group: definition.group,
            name: pair.name,
            ids: [definition.id, other.id],
            pair: [definition, other],
          },
        ]
      : [
          {
            id: definition.id,
            group: definition.group,
            name: definition.name,
            when: definition.when,
            ids: [definition.id],
          },
        ];
  });
}

/** Two keys that differ only in the last cap share their modifiers: Alt ↑ ↓. */
function PairKeys({
  pair,
  platform,
}: {
  pair: readonly [ShortcutDefinition, ShortcutDefinition];
  platform: KeyPlatform;
}) {
  const [first, second] = pair.map((definition) => shortcutLabels(definition, platform)[0] ?? []);
  const shared =
    first.length === second.length && first.slice(0, -1).every((cap, i) => cap === second[i]);
  const chords = shared ? [[...first, second.at(-1) ?? '']] : [first, second];
  return (
    <span data-slot="shortcut-keys" className="inline-flex shrink-0 items-center gap-1">
      {chords.map((caps, chordIndex) => (
        <span key={chordIndex} className="inline-flex items-center gap-1">
          {chordIndex > 0 ? <span className="px-0.5 text-caption text-faint">{t`or`}</span> : null}
          {caps.map((cap, capIndex) => (
            <KeyCap key={capIndex}>{cap}</KeyCap>
          ))}
        </span>
      ))}
    </span>
  );
}

function ShortcutSheetBody({ onColumns }: { onColumns: (columns: number) => void }) {
  const detected = useKeyPlatform();
  const [platform, setPlatform] = useState<KeyPlatform>(detected);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const shortcuts = useShortcutList();
  // Read once per opening. Keys in a place (the composer, a menu, the graph)
  // work wherever that place has focus, so only global keys are marked.
  const [active] = useState(activeShortcutIds);
  const localGroups = useMemo(
    () => new Set(SHORTCUT_GROUPS.filter((g) => g.scope === 'local').map((g) => g.id)),
    [],
  );
  const rows = useMemo(() => sheetRows(shortcuts, platform), [shortcuts, platform]);
  const groups = useMemo(
    () =>
      SHORTCUT_GROUPS.map((group) => ({
        ...group,
        items: rows.filter(
          (row) =>
            row.group === group.id &&
            (!deferredQuery || row.name.toLowerCase().includes(deferredQuery)),
        ),
      })).filter((group) => group.items.length > 0),
    [rows, deferredQuery],
  );
  // Sized by the unfiltered list so the sheet keeps its width while you type.
  const [columns] = useState(() =>
    Math.min(4, Math.max(1, Math.ceil(rows.length / ROWS_PER_COLUMN))),
  );
  useLayoutEffect(() => onColumns(columns), [columns, onColumns]);
  return (
    <KeyPlatformContext.Provider value={platform}>
      {/* Below 600px the header folds to two rows: title, OS and close, then the find field and legend. */}
      <div className="flex h-12 min-w-0 shrink-0 items-center gap-3 border-b border-border px-[18px] max-[599px]:h-auto max-[599px]:flex-wrap max-[599px]:gap-y-2.5 max-[599px]:py-2.5">
        <DialogTitle className="shrink-0 font-sans text-[0.875rem] leading-none font-semibold whitespace-nowrap">
          {t`Keyboard shortcuts`}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t`Every key, grouped by where it works.`}
        </DialogDescription>
        <span
          aria-hidden="true"
          className="hidden basis-full max-[599px]:order-2 max-[599px]:block"
        />
        <div className="relative ml-6 w-[300px] min-w-[7.5rem] shrink max-[599px]:order-3 max-[599px]:ml-0 max-[599px]:w-auto max-[599px]:flex-1">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint"
          />
          <Input
            aria-label={t`Find a shortcut`}
            placeholder={t`Find a shortcut`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-[30px] rounded-[7px] pl-8 text-meta"
          />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-4 text-label text-faint max-[599px]:contents">
          <span className="flex items-center gap-1.5 whitespace-nowrap max-[599px]:order-4">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
            {WORKS_HERE}
          </span>
          <SegmentedControl
            label={t`Show keys for`}
            options={PLATFORM_OPTIONS}
            value={platform}
            onValueChange={setPlatform}
            className="border border-border bg-transparent p-0 max-[599px]:order-1 max-[599px]:ml-auto"
          />
          <DialogClose
            aria-label={t`Close`}
            title={t`Close`}
            className="rounded-[5px] outline-none focus-visible:ring-1 focus-visible:ring-ring max-[599px]:order-1 max-[599px]:grid max-[599px]:size-7 max-[599px]:place-items-center max-[599px]:text-muted-foreground max-[599px]:hover:text-foreground"
          >
            <KeyCap className="max-[599px]:hidden">
              {/* i18n-ignore: key name, as printed on the key */}
              Esc
            </KeyCap>
            <CloseIcon aria-hidden="true" className="hidden size-4 max-[599px]:block" />
          </DialogClose>
        </div>
      </div>
      <div className="@container min-h-0 flex-1 overflow-y-auto px-[18px] pt-3.5 pb-[18px]">
        {groups.length === 0 ? (
          <StateView kind="empty" title={t`No shortcut matches`} />
        ) : (
          <div className={cn('columns-1 gap-[30px]', SHEET_COLUMNS[columns])}>
            {groups.map((group) => (
              <section key={group.id} aria-label={group.label} className="mb-3 break-inside-avoid">
                <h3 className="mb-1 truncate text-caption font-normal text-faint">{group.label}</h3>
                <ul>
                  {group.items.map((row) => {
                    const here = !localGroups.has(group.id) && row.ids.some((id) => active.has(id));
                    return (
                      <li
                        key={row.id}
                        data-slot="shortcut-sheet-row"
                        className="flex min-h-[30px] min-w-0 items-center gap-2 text-menu whitespace-nowrap"
                      >
                        <span
                          aria-hidden="true"
                          className={cn('size-1.5 shrink-0 rounded-full', here && 'bg-primary')}
                        />
                        <span
                          className="min-w-0 flex-1 truncate"
                          // Mid-line labels are case-folded; safe in every offered language.
                          title={
                            row.when
                              ? t`${ph({ name: row.name })}: ${ph({ when: row.when.toLocaleLowerCase(formatLocale()) })}`
                              : row.name
                          }
                        >
                          {row.name}
                          {row.when ? (
                            <span className="sr-only">
                              , {row.when.toLocaleLowerCase(formatLocale())}
                            </span>
                          ) : null}
                          {here ? (
                            <span className="sr-only">
                              , {WORKS_HERE.toLocaleLowerCase(formatLocale())}
                            </span>
                          ) : null}
                        </span>
                        {row.pair ? (
                          <PairKeys pair={row.pair} platform={platform} />
                        ) : (
                          <ShortcutKeys id={row.id} variant="caps" />
                        )}
                      </li>
                    );
                  })}
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
 * Every key, grouped by where it works, in the platform's form with a switch
 * to read the other one. A dot marks the global keys that work on the current
 * screen. The body mounts only while open.
 */
export const ShortcutSheet = memo(function ShortcutSheet({
  open,
  onOpenChange,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
}) {
  const [columns, setColumns] = useState(2);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-frame="shortcut-sheet"
        showCloseButton={false}
        className={cn(
          'top-1/2 flex max-h-[min(640px,calc(100dvh-2rem))] w-[calc(100vw-2rem)] max-w-none -translate-y-1/2 flex-col gap-0 overflow-hidden rounded-[12px] p-0 sm:max-w-none',
          'max-[599px]:inset-0 max-[599px]:h-dvh max-[599px]:max-h-none max-[599px]:w-full max-[599px]:translate-x-0 max-[599px]:translate-y-0 max-[599px]:rounded-none',
          SHEET_WIDTH[columns],
          className,
        )}
      >
        {open ? <ShortcutSheetBody onColumns={setColumns} /> : null}
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
  const openSheet = useCallback(() => setOpen(true), []);
  useShortcut('shortcuts', () => setOpen((current) => !current));
  useMenuAction('keyboard-shortcuts', openSheet);
  return <ShortcutSheet open={open} onOpenChange={setOpen} />;
}
