import { ListFilterIcon } from 'lucide-react';
import { Badge as ReUIBadge } from '@/components/reui/badge';
import { Button } from '@/components/ui/button';
import { useDataHeaderCompact } from './data-header-density';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  ClioRangeColumnFilter,
  ClioTextColumnFilter,
  type ClioColumnFilterValue,
} from './data-table-column-filter';

/** One filterable field a chart or map offers in its own filter popover. */
export interface DataFilterField {
  key: string;
  label: string;
  kind: 'number' | 'text';
}

/**
 * The same server-side filter controls `clio.data-table.v1`'s column headers
 * use, in a small popover attached to a chart or map — the owner's ruling
 * that charts and maps get "the same server-side filter controls as the
 * table ... layered on the agent's query". A toolbar button (not a per-column
 * header, since these components have none) opens the popover; a badge shows
 * how many of this viewer's own filters are active.
 */
export function DataFilterPopover({
  disabled,
  fields,
  filters,
  label = 'Filters',
  onFilterChange,
}: {
  disabled?: boolean;
  fields: readonly DataFilterField[];
  filters: ReadonlyMap<string, ClioColumnFilterValue>;
  label?: string;
  onFilterChange: (column: string, value: ClioColumnFilterValue | undefined) => void;
}) {
  const activeCount = filters.size;
  const compact = useDataHeaderCompact();
  if (!fields.length) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={activeCount ? `${label}, ${activeCount} active` : label}
          className="gap-1.5"
          disabled={disabled}
          size="sm"
          title={label}
          variant="outline"
        >
          <ListFilterIcon aria-hidden="true" className="size-3.5" />
          {compact ? null : label}
          {activeCount ? (
            <ReUIBadge className="ms-0.5" radius="full" size="sm" variant="primary-light">
              {activeCount}
            </ReUIBadge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <PopoverHeader>
          <PopoverTitle>{label}</PopoverTitle>
          <PopoverDescription>Layered on top of the agent's own query.</PopoverDescription>
        </PopoverHeader>
        <div className="grid gap-3">
          {fields.map((field) => {
            const value = filters.get(field.key);
            return (
              <div className="grid gap-1" key={field.key}>
                <span className="text-xs font-medium text-muted-foreground">{field.label}</span>
                {field.kind === 'text' ? (
                  <ClioTextColumnFilter
                    columnLabel={field.label}
                    onChange={(contains) =>
                      onFilterChange(field.key, contains ? { kind: 'text', contains } : undefined)
                    }
                    value={value?.kind === 'text' ? value.contains : ''}
                  />
                ) : (
                  <ClioRangeColumnFilter
                    columnLabel={field.label}
                    onChange={({ min, max }) =>
                      onFilterChange(
                        field.key,
                        min !== undefined || max !== undefined ? { kind: 'range', min, max } : undefined,
                      )
                    }
                    value={value?.kind === 'range' ? { max: value.max, min: value.min } : {}}
                  />
                )}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
