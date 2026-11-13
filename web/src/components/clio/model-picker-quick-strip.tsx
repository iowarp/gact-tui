import { TooltipProvider } from '@/components/ui/tooltip';
import { RemoveIcon } from '@/lib/icon-vocabulary';
import type { ModelFilterToken } from '@/lib/model-filter-tokens';
import type { QuickFilter } from '@/lib/model-quick-filters';
import { cn } from '@/lib/utils';
import { QUICK_FILTER_ICONS as QUICK_ICONS } from './model-quick-filter-icons';
import { IconButton } from './primitives/icon-button';
import { ShortcutKeys } from './primitives/key-chip';
import { plural, t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

interface ModelPickerQuickStripProps {
  filters: readonly QuickFilter[];
  onToggle: (filter: QuickFilter) => void;
  /** Filters on that the strip does not draw (typed or picked in the panel). */
  extraTokens: readonly ModelFilterToken[];
  onRemoveToken: (token: ModelFilterToken) => void;
  /** What the typed word completes to; replaces the strip while typing. */
  suggestions: readonly ModelFilterToken[];
  onSuggestion: (token: ModelFilterToken) => void;
}

const CHIP_CLASS =
  'inline-flex h-6 shrink-0 items-center gap-1 rounded-[6px] border border-border px-1.5 font-mono text-caption whitespace-nowrap text-foreground';

/**
 * Row 2 of the model picker: the quick filters as icons, each named on hover
 * and pressed while on, then any other filter that is on as a removable chip.
 * While a filter is being typed it offers the tokens that exist instead.
 */
export function ModelPickerQuickStrip({
  filters,
  onToggle,
  extraTokens,
  onRemoveToken,
  suggestions,
  onSuggestion,
}: ModelPickerQuickStripProps) {
  const removable = extraTokens.length > 0 || filters.some((filter) => filter.active);
  return (
    <TooltipProvider delayDuration={450} disableHoverableContent>
      <div
        className="flex h-8 min-w-0 items-center gap-0.5 overflow-hidden ps-2 pe-2"
        data-slot="model-picker-row-2"
      >
        {suggestions.length ? (
          <div
            className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]"
            data-slot="filter-token-suggestions"
          >
            {suggestions.map((token) => (
              <button
                className={cn(
                  CHIP_CLASS,
                  'cursor-pointer text-muted-foreground hover:bg-hover hover:text-foreground',
                )}
                key={token}
                onClick={() => onSuggestion(token)}
                type="button"
              >
                {token}
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="flex shrink-0 items-center gap-0.5" data-slot="quick-filters">
              {filters.map((filter) => {
                const Icon = QUICK_ICONS[filter.id];
                const name = filter.label;
                const label =
                  filter.count === undefined
                    ? filter.label
                    : plural(filter.count, {
                        one: `${name}: # model`,
                        other: `${name}: # models`,
                      });
                return (
                  <IconButton
                    aria-pressed={filter.active}
                    className={cn(
                      'h-6 w-auto min-w-[26px] gap-1 px-[5px] font-mono text-caption',
                      'aria-pressed:bg-accent aria-pressed:text-accent-foreground',
                    )}
                    data-token={filter.token}
                    icon={
                      <>
                        <Icon aria-hidden="true" />
                        {filter.active && filter.value ? <span>{filter.value}</span> : null}
                      </>
                    }
                    key={filter.id}
                    label={label}
                    onClick={() => onToggle(filter)}
                    size="sm"
                    type="button"
                  />
                );
              })}
            </div>
            {extraTokens.length ? (
              <div
                className="ms-1 flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]"
                data-slot="filter-tokens"
              >
                {extraTokens.map((token) => (
                  <span className={cn(CHIP_CLASS, 'pe-0.5')} data-token={token} key={token}>
                    {token}
                    <button
                      aria-label={t`Remove ${token}`}
                      className="inline-flex size-4 items-center justify-center rounded-[4px] text-muted-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                      onClick={() => onRemoveToken(token)}
                      type="button"
                    >
                      <RemoveIcon aria-hidden="true" className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            {removable ? (
              <span className="ms-auto hidden shrink-0 items-center gap-1 ps-2 text-caption whitespace-nowrap text-faint @[30rem]/picker-search:inline-flex">
                <Trans>
                  <ShortcutKeys className="text-caption text-faint" id="menu-drop-filter" /> drops
                  the last filter
                </Trans>
              </span>
            ) : null}
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
