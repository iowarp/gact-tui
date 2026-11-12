import { LayersIcon, SearchXIcon, SparklesIcon } from 'lucide-react';
import { CommandGroup, CommandItem, CommandShortcut } from '@/components/ui/command';
import { vocab } from '@/lib/brand-vocabulary';
import { ResultTrail } from './global-search-results';
import { ShortcutKeys } from './primitives/key-chip';

/**
 * Nothing matched in the open type: one line saying where it looked, then the
 * two ways on, widening to every type or asking the search assistant.
 */
export function CommandMenuNoMatch({
  query,
  scope,
  total,
  canAsk,
  onAllTypes,
  onAsk,
}: {
  query: string;
  /** The open type's name; undefined under All. */
  scope?: string;
  /** Matches across every type. */
  total: number;
  canAsk: boolean;
  onAllTypes?: () => void;
  onAsk: () => void;
}) {
  return (
    <>
      <p
        className="flex min-w-0 items-center gap-2 px-2.5 pt-4 pb-2 text-menu whitespace-nowrap text-muted-foreground"
        role="status"
      >
        <SearchXIcon aria-hidden="true" className="size-4 shrink-0 text-faint" />
        <span className="min-w-0 truncate">
          {scope ? `Nothing in ${scope.toLocaleLowerCase()} matches ` : 'Nothing matches '}
          <b className="font-medium text-foreground">{query}</b>
        </span>
      </p>
      <CommandGroup>
        {onAllTypes ? (
          <CommandItem onSelect={onAllTypes} value="no-match:all-types">
            <LayersIcon aria-hidden="true" />
            <span className="min-w-0 flex-[0_1_auto] truncate">Search all types</span>
            <ResultTrail>
              {total ? `${total} ${total === 1 ? 'result' : 'results'}` : null}
            </ResultTrail>
          </CommandItem>
        ) : null}
        <CommandItem disabled={!canAsk} onSelect={onAsk} value="no-match:ask">
          <SparklesIcon aria-hidden="true" />
          <span className="min-w-0 flex-[0_1_auto] truncate">Ask {vocab.agent}</span>
          <CommandShortcut>
            <ShortcutKeys id="menu-ask" variant="inline" />
          </CommandShortcut>
        </CommandItem>
      </CommandGroup>
    </>
  );
}
