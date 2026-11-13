import { ListFilterIcon } from 'lucide-react';
import { IconButton } from '@/components/clio/primitives/icon-button';
import { ListGroupLabel, ListRow } from '@/components/clio/primitives/list-row';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { t, ph } from '@lingui/core/macro';

/** Which conversations the list shows, by the state each row already marks. */
export type ConversationFilter = 'all' | 'attention' | 'running' | 'unseen';

const FILTERS: readonly { id: ConversationFilter; label: string }[] = [
  { id: 'all', label: t`All conversations` },
  { id: 'attention', label: t`Needs you` },
  { id: 'running', label: t`Working now` },
  { id: 'unseen', label: t`New activity` },
];

export function ConversationFilterMenu({
  value,
  onChange,
}: {
  value: ConversationFilter;
  onChange: (value: ConversationFilter) => void;
}) {
  const active = FILTERS.find((filter) => filter.id === value) ?? FILTERS[0]!;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          aria-pressed={value !== 'all'}
          icon={<ListFilterIcon />}
          label={
            value === 'all'
              ? t`Filter conversations`
              : t`Filter conversations, ${ph({ label: active.label })}`
          }
          size="sm"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>{t`Show`}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          onValueChange={(next) => onChange(next as ConversationFilter)}
          value={value}
        >
          {FILTERS.map((filter) => (
            <DropdownMenuRadioItem key={filter.id} value={filter.id}>
              {filter.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Shown in place of the list when a filter leaves nothing. */
export function NoMatchingConversations({ onShowAll }: { onShowAll: () => void }) {
  return (
    <ListRow
      className="h-7 pl-2.5 text-meta text-muted-foreground"
      meta={
        <button
          className="rounded-[4px] text-label text-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-1 focus-visible:ring-ring"
          onClick={onShowAll}
          type="button"
        >
          {t`Show all`}
        </button>
      }
      title={<span className="truncate">{t`No matching conversations`}</span>}
    />
  );
}

export function ConversationDayLabel({ children }: { children: string }) {
  return (
    <ListGroupLabel className="h-[22px] pb-[3px] pl-2.5 font-normal text-faint">
      {children}
    </ListGroupLabel>
  );
}
