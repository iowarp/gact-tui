import { BoxIcon, LayersIcon, ListIcon, PlugIcon, SearchIcon, SparklesIcon } from 'lucide-react';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
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
import { EXTENSION_TYPE_LABELS, type ExtensionType } from '@/lib/extension-library-entries';
import { AddIcon, CloseIcon, MoreIcon } from '@/lib/icon-vocabulary';
import type { ExtensionAdd } from './extension-add-dialog';
import { InfoTip } from './info-tip';
import { IconButton } from './primitives/icon-button';
import { SegmentedControl } from './primitives/segmented-control';
import { SplitButton } from './primitives/split-button';

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
  { kind: 'remote', label: 'MCP server URL' },
  { kind: 'local', label: 'Local MCP command' },
  { kind: 'import', label: 'Repository or host folder' },
  { kind: 'upload', label: 'Upload ZIP' },
  { kind: 'skill', label: 'Create a skill' },
  { kind: 'plugin', label: 'Compose a plugin' },
];

/** What Add does for the type in view. */
function defaultAdd(type: ExtensionType): ExtensionAdd {
  if (type === 'mcp') return { kind: 'remote', category: 'mcp' };
  if (type === 'skills') return { kind: 'skill', category: 'skills' };
  if (type === 'plugins') return { kind: 'plugin', category: 'plugins' };
  return { kind: 'import' };
}

/** Type tabs, Yours | Discover, search and Add, on one line that folds with the list's width. */
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
  /** Enter in the field: search the MCP Registry in Discover. */
  onSearchSubmit: (search: string) => void;
  supported: boolean | undefined;
  onAdd: (choice: ExtensionAdd) => void;
  onAddMarketplace: () => void;
}) {
  const [searching, setSearching] = useState(Boolean(search));
  const closeSearch = () => {
    onSearchChange('');
    onSearchSubmit('');
    setSearching(false);
  };
  return (
    <div
      className="flex h-[2.125rem] min-w-0 items-center gap-2"
      role="toolbar"
      aria-label="Extensions"
    >
      <TypeTabs onValueChange={onTypeChange} value={type} />
      <SegmentedControl
        label="Show"
        onValueChange={onViewChange}
        options={[
          { value: 'yours', label: 'Yours' },
          { value: 'discover', label: 'Discover' },
        ]}
        value={view}
      />
      <span className="min-w-0 flex-1" />
      {searching ? (
        <form
          className="flex min-w-0 basis-[30%] items-center"
          onSubmit={(event) => {
            event.preventDefault();
            onSearchSubmit(search);
          }}
          role="search"
        >
          <Input
            aria-label="Search extensions"
            autoFocus
            className="h-7 min-w-0 text-xs"
            onChange={(event) => onSearchChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;
              event.stopPropagation();
              closeSearch();
            }}
            placeholder={view === 'discover' ? 'Search, Enter for the registry' : 'Search'}
            value={search}
          />
          <IconButton icon={<CloseIcon />} label="Close search" onClick={closeSearch} />
        </form>
      ) : (
        <IconButton
          icon={<SearchIcon />}
          label="Search extensions"
          onClick={() => setSearching(true)}
        />
      )}
      {supported === false ? (
        <InfoTip label="Why Add is unavailable">
          Adding or composing extensions needs a newer agent service. Existing sources can still be
          inspected.
        </InfoTip>
      ) : null}
      <span className="inline-flex shrink-0">
        <SplitButton
          disabled={supported !== true}
          icon={<AddIcon aria-hidden="true" />}
          label="Add"
          menuLabel="Add options"
          onClick={() => (type === 'marketplaces' ? onAddMarketplace() : onAdd(defaultAdd(type)))}
          // Disabled keeps readable words; the ⓘ beside it says why.
          className="[&_button:disabled]:text-muted-foreground [&_button:disabled]:opacity-100!"
          showLabel
          variant="outline"
        >
          <DropdownMenuItem onSelect={onAddMarketplace}>
            <BoxIcon aria-hidden="true" />
            Marketplace…
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
          label="Extension type"
          onValueChange={onValueChange}
          options={TYPES}
          value={value}
        />
      </div>
      <div className="hidden min-w-0 @[35rem]/ext:flex @[46.25rem]/ext:hidden" data-fold="icons">
        <SegmentedControl
          iconOnly="others"
          label="Extension type"
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
          label="Extension type"
          onValueChange={onValueChange}
          options={[current]}
          value={value}
        />
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <IconButton icon={<MoreIcon />} label="More types" />
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
