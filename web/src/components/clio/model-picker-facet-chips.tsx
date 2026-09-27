import { ModelSelectorLogo } from '@/components/ai-elements/model-selector';
import { Badge } from '@/components/reui/badge';
import type { FacetChip } from '@/lib/model-facets';
import { providerLogoId } from '@/lib/provider-presentation';
import { cn } from '@/lib/utils';
import { tagIcon } from './model-capability-tag-icons';

interface FacetChipClusterProps {
  chips: readonly FacetChip[];
  onToggle: (chip: FacetChip) => void;
  /** Chips this cluster does not show; renders a "+N" that opens `onMore`. */
  more?: number;
  onMore?: () => void;
  /** The name of what "+N" opens ("Tasks"), for its accessible label. */
  moreLabel?: string;
}

/**
 * One cluster of filter chips, Hugging Face style: a bordered chip per tag
 * with its icon, its name and how many models it would match. Pressing a chip
 * toggles its `key:value` token in the search bar; an active chip reads as
 * selected (`aria-pressed`). A chip hidden only by a default token counts
 * what it would list and swaps that default out when pressed (its tooltip
 * says so); a chip that would list nothing reads muted and cannot be pressed.
 */
export function FacetChipCluster({ chips, onToggle, more = 0, onMore, moreLabel }: FacetChipClusterProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-slot="facet-chips">
      {chips.map((chip) => {
        const Icon = chip.icon.kind === 'tag' ? tagIcon(chip.icon.tag) : undefined;
        const empty = !chip.active && chip.count === 0;
        const swap = chip.replaces.length ? ` (replaces ${chip.replaces.join(', ')})` : '';
        return (
          <Badge
            asChild
            key={chip.token}
            radius="default"
            size="xl"
            variant={chip.active ? 'primary-light' : 'outline'}
          >
            <button
              aria-label={`${chip.label}: ${chip.count} ${chip.count === 1 ? 'model' : 'models'}${swap}`}
              aria-pressed={chip.active}
              className={cn(
                'cursor-pointer gap-1.5 font-normal hover:border-primary/40 hover:text-foreground',
                !chip.active && 'text-foreground/85',
                empty && 'cursor-not-allowed opacity-55 hover:border-border hover:text-foreground/85',
              )}
              data-slot="facet-chip"
              data-token={chip.token}
              data-replaces={chip.replaces.join(' ') || undefined}
              disabled={empty}
              onClick={() => onToggle(chip)}
              title={`${chip.token}${swap}`}
              type="button"
            >
              {Icon ? (
                <Icon aria-hidden="true" className="size-3.5 text-muted-foreground" />
              ) : chip.icon.kind === 'provider' ? (
                <ModelSelectorLogo className="size-3.5" provider={providerLogoId(chip.icon.providerId)} />
              ) : null}
              <span>{chip.label}</span>
              <span
                className={cn('text-xs tabular-nums', chip.active ? 'text-primary/80' : 'text-muted-foreground')}
                data-slot="facet-chip-count"
              >
                {chip.count}
              </span>
            </button>
          </Badge>
        );
      })}
      {more > 0 && onMore ? (
        <Badge asChild radius="default" size="xl" variant="outline">
          <button
            aria-label={`${more} more ${moreLabel ?? ''}`.trim()}
            className="cursor-pointer font-normal text-muted-foreground hover:text-foreground"
            data-slot="facet-more"
            onClick={onMore}
            type="button"
          >
            +{more}
          </button>
        </Badge>
      ) : null}
    </div>
  );
}
