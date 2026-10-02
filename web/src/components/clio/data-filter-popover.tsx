import { ListFilterIcon } from 'lucide-react';
import { useState } from 'react';
import { Badge as ReUIBadge } from '@/components/reui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ClioRangeColumnFilter,
  ClioTextColumnFilter,
  type ClioColumnFilterValue,
} from './data-table-column-filter';

/** One filterable field a chart or map offers in its own filter popover. */
export interface DataFilterField {
  key: string;
  label: string;
  kind: 'number' | 'text' | 'year' | 'date';
  precision?: 's' | 'ms' | 'us' | 'ns' | 'text';
}

function YearRangeFilter({
  field,
  value,
  onChange,
}: {
  field: DataFilterField;
  value: ClioColumnFilterValue | undefined;
  onChange: (value: ClioColumnFilterValue | undefined) => void;
}) {
  const current = value?.kind === 'year' ? value : undefined;
  const [from, setFrom] = useState(current?.min?.toString() ?? '');
  const [to, setTo] = useState(current?.max?.toString() ?? '');
  const commit = (nextFrom: string, nextTo: string) => {
    if ((nextFrom && nextFrom.length !== 4) || (nextTo && nextTo.length !== 4)) return;
    onChange(
      nextFrom || nextTo
        ? {
            kind: 'year',
            min: nextFrom ? Number(nextFrom) : undefined,
            max: nextTo ? Number(nextTo) : undefined,
            precision: field.precision ?? 'text',
          }
        : undefined,
    );
  };
  return (
    <div className="grid grid-cols-2 gap-2">
      <Input
        aria-label={`From year for ${field.label}`}
        inputMode="numeric"
        maxLength={4}
        onChange={(event) => {
          const next = event.target.value.replace(/\D/g, '').slice(0, 4);
          setFrom(next);
          commit(next, to);
        }}
        placeholder="From year"
        value={from}
      />
      <Input
        aria-label={`To year for ${field.label}`}
        inputMode="numeric"
        maxLength={4}
        onChange={(event) => {
          const next = event.target.value.replace(/\D/g, '').slice(0, 4);
          setTo(next);
          commit(from, next);
        }}
        placeholder="To year"
        value={to}
      />
    </div>
  );
}

function DateRangeFilter({
  field,
  value,
  onChange,
}: {
  field: DataFilterField;
  value: ClioColumnFilterValue | undefined;
  onChange: (value: ClioColumnFilterValue | undefined) => void;
}) {
  const current = value?.kind === 'date' ? value : undefined;
  const [from, setFrom] = useState(current?.min ?? '');
  const [to, setTo] = useState(current?.max ?? '');
  const commit = (nextFrom: string, nextTo: string) => {
    onChange(
      nextFrom || nextTo
        ? {
            kind: 'date',
            min: nextFrom || undefined,
            max: nextTo || undefined,
            precision: field.precision ?? 'text',
          }
        : undefined,
    );
  };
  return (
    <div className="grid grid-cols-2 gap-2">
      <Input
        aria-label={`From date for ${field.label}`}
        className="min-w-0"
        onChange={(event) => {
          setFrom(event.target.value);
          commit(event.target.value, to);
        }}
        type="date"
        value={from}
      />
      <Input
        aria-label={`To date for ${field.label}`}
        className="min-w-0"
        onChange={(event) => {
          setTo(event.target.value);
          commit(from, event.target.value);
        }}
        type="date"
        value={to}
      />
    </div>
  );
}

/**
 * The same server-side filter controls `clio.data-table.v1`'s column headers
 * use, in a small popover attached to a chart or map — the owner's ruling
 * that charts and maps get "the same server-side filter controls as the
 * table ... layered on the agent's query". An icon-only toolbar button (G0's
 * shared toolbar styling: every affordance has one predictable home, same
 * icon/size/tooltip pattern everywhere) opens the popover; a badge shows how
 * many of this viewer's own filters are active.
 */
export function DataFilterPopover({
  disabled,
  fields,
  filters,
  label = 'Filters',
  onFilterChange,
  onOpenChange,
}: {
  disabled?: boolean;
  fields: readonly DataFilterField[];
  filters: ReadonlyMap<string, ClioColumnFilterValue>;
  label?: string;
  onFilterChange: (column: string, value: ClioColumnFilterValue | undefined) => void;
  /** Reports this popover's own open state back to the surface toolbar, so it stays revealed while Filters is open (#516 review item 12). */
  onOpenChange?: (open: boolean) => void;
}) {
  const activeCount = filters.size;
  if (!fields.length) return null;
  return (
    <Popover onOpenChange={onOpenChange}>
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                aria-label={activeCount ? `${label}, ${activeCount} active` : label}
                className="relative"
                disabled={disabled}
                size="icon-sm"
                variant="ghost"
              >
                <ListFilterIcon aria-hidden="true" className="size-3.5" />
                {activeCount ? (
                  <ReUIBadge
                    className="absolute -right-1 -top-1 h-3.5 min-w-3.5 px-0.5 text-[0.6rem] leading-none"
                    radius="full"
                    size="sm"
                    variant="primary-light"
                  >
                    {activeCount}
                  </ReUIBadge>
                ) : null}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {activeCount ? `${label}, ${activeCount} active` : label}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
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
                {field.kind === 'year' ? (
                  <YearRangeFilter
                    field={field}
                    onChange={(next) => onFilterChange(field.key, next)}
                    value={value}
                  />
                ) : field.kind === 'date' ? (
                  <DateRangeFilter
                    field={field}
                    onChange={(next) => onFilterChange(field.key, next)}
                    value={value}
                  />
                ) : field.kind === 'text' ? (
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
                        min !== undefined || max !== undefined
                          ? { kind: 'range', min, max }
                          : undefined,
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
