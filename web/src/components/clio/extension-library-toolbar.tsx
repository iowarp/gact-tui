import { BoxIcon, LayersIcon, ListIcon, PlugIcon, SearchIcon, SparklesIcon } from 'lucide-react';
import { startTransition, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  defaultAdd,
  EXTENSION_TYPE_LABELS,
  type ExtensionType,
} from '@/lib/extension-library-entries';
import { AddIcon, CloseIcon, MoreIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import type { ExtensionAdd } from './extension-add-dialog';
import { InfoTip } from './info-tip';
import { IconButton } from './primitives/icon-button';
import { SegmentedControl } from './primitives/segmented-control';
import { SplitButton } from './primitives/split-button';
import { t } from '@lingui/core/macro';

export type ExtensionView = 'yours' | 'discover';

const TYPE_ICONS: Record<ExtensionType, ReactNode> = {
  all: <ListIcon />,
  plugins: <LayersIcon />,
  marketplaces: <BoxIcon />,
  mcp: <PlugIcon />,
  skills: <SparklesIcon />,
};

const TYPES = (Object.keys(EXTENSION_TYPE_LABELS) as ExtensionType[]).map((value) => ({
  value,
  label: EXTENSION_TYPE_LABELS[value],
  icon: TYPE_ICONS[value],
}));

const ADD_CHOICES: { kind: ExtensionAdd['kind']; label: string }[] = [
  // The raw connection form, for a server with no connector entry (CN12).
  { kind: 'remote', label: t`Add by URL or command` },
  { kind: 'import', label: t`Repository or host folder` },
  { kind: 'upload', label: t`Upload ZIP` },
  { kind: 'skill', label: t`Create a skill` },
  { kind: 'plugin', label: t`Compose a plugin` },
];

/**
 * Type tabs, Yours | Discover, the search field and Add (DC-D9). Where the list is wide
 * they share one line, the field taking the room between the tabs and Add; narrower (a
 * phone, or beside an open pane) the field has its own full-width line under them.
 */
export function ExtensionToolbar({
  type,
  onTypeChange,
  view,
  onViewChange,
  search,
  onSearchChange,
  onSearchSubmit,
  supported,
  onAdd,
  onAddMarketplace,
}: {
  type: ExtensionType;
  onTypeChange: (type: ExtensionType) => void;
  view: ExtensionView;
  onViewChange: (view: ExtensionView) => void;
  search: string;
  onSearchChange: (search: string) => void;
  /** Enter in the field: in Discover, also search the MCP Registry for it. */
  onSearchSubmit: (search: string) => void;
  supported: boolean | undefined;
  onAdd: (choice: ExtensionAdd) => void;
  onAddMarketplace: () => void;
}) {
  return (
    <div
      className="flex min-h-[2.125rem] min-w-0 flex-wrap items-center gap-x-2 gap-y-2"
      role="toolbar"
      aria-label={t`Extensions`}
    >
      <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2">
        <TypeTabs onValueChange={onTypeChange} value={type} />
        <SegmentedControl
          label={t`Show`}
          onValueChange={onViewChange}
          options={[
            { value: 'yours', label: t`Yours` },
            { value: 'discover', label: t`Discover` },
          ]}
          value={view}
          wrap
        />
      </div>
      <ExtensionSearchField
        className="order-last basis-full @[52rem]/ext:order-none @[52rem]/ext:min-w-48 @[52rem]/ext:flex-1 @[52rem]/ext:basis-auto"
        onSearchChange={onSearchChange}
        onSearchSubmit={onSearchSubmit}
        search={search}
      />
      <span className="ml-auto inline-flex shrink-0 items-center gap-2">
        {supported === false ? (
          <InfoTip label={t`Why Add is unavailable`}>
            {t`Adding or composing extensions needs a newer agent service. Existing sources can still be inspected.`}
          </InfoTip>
        ) : null}
        <SplitButton
          disabled={supported !== true}
          icon={<AddIcon aria-hidden="true" />}
          label={t`Add`}
          menuLabel={t`Add options`}
          onClick={() => (type === 'marketplaces' ? onAddMarketplace() : onAdd(defaultAdd(type)))}
          // Disabled keeps readable words; the ⓘ beside it says why.
          className="[&_button:disabled]:text-muted-foreground [&_button:disabled]:opacity-100!"
          showLabel
          variant="outline"
        >
          <DropdownMenuItem onSelect={onAddMarketplace}>
            <BoxIcon aria-hidden="true" />
            {t`Marketplace…`}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {ADD_CHOICES.map((choice) => (
            <DropdownMenuItem
              key={choice.kind}
              onSelect={() =>
                onAdd({
                  kind: choice.kind,
                  category: type === 'all' || type === 'marketplaces' ? undefined : type,
                })
              }
            >
              {choice.label}…
            </DropdownMenuItem>
          ))}
        </SplitButton>
      </span>
    </div>
  );
}

/**
 * The search field, always shown. It keeps what is typed and hands it to the list as a
 * transition, so each key repaints the field at once and the list follows. Its clear
 * button appears only while there is text; Esc clears it too, and an empty field lets
 * Esc through to the window.
 */
function ExtensionSearchField({
  search,
  onSearchChange,
  onSearchSubmit,
  className,
}: {
  search: string;
  onSearchChange: (search: string) => void;
  onSearchSubmit: (search: string) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(search);
  const input = useRef<HTMLInputElement>(null);
  const change = (next: string) => {
    setDraft(next);
    startTransition(() => onSearchChange(next));
  };
  return (
    <form
      className={cn('relative flex min-w-0 items-center', className)}
      data-escape-scope=""
      onSubmit={(event) => {
        event.preventDefault();
        onSearchSubmit(draft);
      }}
      role="search"
    >
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute left-2 size-3.5 text-muted-foreground"
      />
      <Input
        aria-label={t`Search extensions`}
        className="h-7 min-w-0 pr-8 pl-7 text-xs"
        data-extension-search=""
        onChange={(event) => change(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || !draft) return;
          event.stopPropagation();
          change('');
        }}
        placeholder={t`Search plugins, connectors and skills`}
        ref={input}
        value={draft}
      />
      {draft ? (
        <IconButton
          className="absolute right-0.5 size-6"
          icon={<CloseIcon />}
          label={t`Clear search`}
          onClick={() => {
            change('');
            input.current?.focus();
          }}
          size="sm"
          type="button"
        />
      ) : null}
    </form>
  );
}

/**
 * The type tabs fold with the list's width: names, then icons named on hover,
 * then the current type and ⋯ for the rest. ← → still move through all five.
 */
function TypeTabs({
  value,
  onValueChange,
}: {
  value: ExtensionType;
  onValueChange: (value: ExtensionType) => void;
}) {
  const current = TYPES.find((row) => row.value === value) ?? TYPES[0]!;
  const step = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = TYPES.indexOf(current);
    const next =
      TYPES[(index + (event.key === 'ArrowRight' ? 1 : TYPES.length - 1)) % TYPES.length];
    if (next) onValueChange(next.value);
  };
  return (
    <>
      <div className="hidden min-w-0 @[46.25rem]/ext:flex" data-fold="full">
        <SegmentedControl
          label={t`Extension type`}
          onValueChange={onValueChange}
          options={TYPES}
          value={value}
        />
      </div>
      <div className="hidden min-w-0 @[35rem]/ext:flex @[46.25rem]/ext:hidden" data-fold="icons">
        <SegmentedControl
          iconOnly="others"
          label={t`Extension type`}
          onValueChange={onValueChange}
          options={TYPES}
          value={value}
        />
      </div>
      <div
        className="flex min-w-0 items-center gap-px @[35rem]/ext:hidden"
        data-fold="current"
        onKeyDown={step}
      >
        <SegmentedControl
          label={t`Extension type`}
          onValueChange={onValueChange}
          options={[current]}
          value={value}
        />
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <IconButton icon={<MoreIcon />} label={t`More types`} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-44">
            <DropdownMenuRadioGroup
              onValueChange={(next) => onValueChange(next as ExtensionType)}
              value={value}
            >
              {TYPES.map((row) => (
                <DropdownMenuRadioItem key={row.value} value={row.value}>
                  {row.icon}
                  {row.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
