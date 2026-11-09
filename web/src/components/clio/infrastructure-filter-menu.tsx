import { ChevronDownIcon, ListFilterIcon, SearchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { MenuRow } from './primitives/menu-row';

export interface InfraFilterOption<Value extends string> {
  value: Value;
  label: string;
  count: number;
}

/** The tab bar's filter anchor ("All"): one choice, each with its count. */
export function InfraFilterMenu<Value extends string>({
  label,
  value,
  options,
  onValueChange,
}: {
  /** Names the filter ("Activity filter"); the trigger reads "Activity filter: All". */
  label: string;
  value: Value;
  options: readonly InfraFilterOption<Value>[];
  onValueChange: (value: Value) => void;
}) {
  const current = options.find((option) => option.value === value) ?? options[0];
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`${label}: ${current?.label ?? ''}`}
          className="h-7 max-w-[132px] min-w-0 gap-1.5 px-2 text-[12px] font-normal"
          size="sm"
          variant="outline"
        >
          <ListFilterIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
          <span className="min-w-0 truncate">{current?.label}</span>
          <ChevronDownIcon aria-hidden="true" className="size-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {options.map((option) => (
          <DropdownMenuItem key={option.value} onSelect={() => onValueChange(option.value)}>
            <MenuRow
              checked={option.value === value}
              label={option.label}
              value={String(option.count)}
            />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A compact search field for the tab bar; Escape clears it. */
export function InfraSearchField({
  label,
  placeholder,
  value,
  onValueChange,
  onEscape,
  autoFocus,
  className,
}: {
  label: string;
  placeholder: string;
  value: string;
  onValueChange: (value: string) => void;
  /** Runs after Escape cleared the field (for example, to fold it back into its icon). */
  onEscape?: () => void;
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <label className={cn('relative block w-[240px] min-w-0 shrink', className)}>
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        aria-label={label}
        autoFocus={autoFocus}
        className="h-7 pl-7 text-[12px] md:text-[12px]"
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          onValueChange('');
          onEscape?.();
        }}
        placeholder={placeholder}
        type="search"
        value={value}
      />
    </label>
  );
}
