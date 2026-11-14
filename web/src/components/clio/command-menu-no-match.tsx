import { LayersIcon, SearchXIcon } from 'lucide-react';
import { CommandGroup, CommandItem } from '@/components/ui/command';
import { ResultTrail } from './global-search-results';
import type { ReactNode } from 'react';
import type { CommandMenuScope } from '@/lib/command-menu-scopes';
import { plural, t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

/** "Nothing in files matches <query>", worded for the open type. */
function nothingMatches(scope: CommandMenuScope | undefined, shown: ReactNode): ReactNode {
  switch (scope) {
    case 'conversations':
      return <Trans>Nothing in conversations matches {shown}</Trans>;
    case 'files':
      return <Trans>Nothing in files matches {shown}</Trans>;
    case 'artifacts':
      return <Trans>Nothing in artifacts matches {shown}</Trans>;
    case 'actions':
      return <Trans>Nothing in actions matches {shown}</Trans>;
    case 'settings':
      return <Trans>Nothing in settings matches {shown}</Trans>;
    case 'more':
      return <Trans>Nothing in more matches {shown}</Trans>;
    default:
      return <Trans>Nothing matches {shown}</Trans>;
  }
}

/**
 * Nothing matched in the open type: one line saying where it looked, then the
 * way on, widening to every type. Asking the assistant stays a footer hint.
 */
export function CommandMenuNoMatch({
  query,
  scope,
  total,
  onAllTypes,
}: {
  query: string;
  /** The open type; undefined under All. */
  scope?: CommandMenuScope;
  /** Matches across every type. */
  total: number;
  onAllTypes?: () => void;
}) {
  return (
    <>
      <p
        className="flex min-w-0 items-center gap-2 px-2.5 pt-4 pb-2 text-menu whitespace-nowrap text-muted-foreground"
        role="status"
      >
        <SearchXIcon aria-hidden="true" className="size-4 shrink-0 text-faint" />
        <span className="min-w-0 truncate">
          {nothingMatches(scope, <b className="font-medium text-foreground">{query}</b>)}
        </span>
      </p>
      <CommandGroup>
        {onAllTypes ? (
          <CommandItem onSelect={onAllTypes} value="no-match:all-types">
            <LayersIcon aria-hidden="true" />
            <span className="min-w-0 flex-[0_1_auto] truncate">{t`Search all types`}</span>
            <ResultTrail>
              {total ? plural(total, { one: '# result', other: '# results' }) : null}
            </ResultTrail>
          </CommandItem>
        ) : null}
      </CommandGroup>
    </>
  );
}
