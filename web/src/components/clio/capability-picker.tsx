import { useState, type ReactNode } from 'react';
import { XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface CapabilityOption {
  id: string;
  title: string;
  source?: string;
  description?: string;
  keywords?: string[];
  group: string;
  icon: ReactNode;
  disabled?: boolean;
  state?: string;
}

/** One searchable choice surface for conversation plugins and extension composition. */
export function CapabilityPicker({
  items,
  pending,
  error,
  onChoose,
  children,
  label = 'Choose capabilities',
  align = 'start',
  disabled = false,
  footer,
}: {
  items: readonly CapabilityOption[];
  pending?: boolean;
  error?: string;
  onChoose: (id: string) => void;
  children: ReactNode;
  label?: string;
  align?: 'start' | 'end';
  disabled?: boolean;
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        {children}
      </PopoverTrigger>
      {open ? (
        <PopoverContent
          aria-label={label}
          align={align}
          className="w-[min(26rem,calc(100vw-2rem))] p-0"
        >
          <Command
            label={`Search ${label.toLowerCase()}`}
            filter={(value, search, keywords) =>
              [value, ...(keywords ?? [])].some((text) =>
                text.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
              )
                ? 1
                : 0
            }
          >
            <CommandInput aria-label={`Search ${label.toLowerCase()}`} placeholder="Search…" />
            <CommandList className="max-h-[min(24rem,60dvh)]">
              {pending ? (
                <p role="status" className="p-4 text-sm text-muted-foreground">
                  Loading capabilities…
                </p>
              ) : null}
              {error ? (
                <p role="alert" className="p-4 text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              {!pending && !error ? <CommandEmpty>No matching capabilities.</CommandEmpty> : null}
              {[...new Set(items.map((row) => row.group))].map((group) => (
                <CommandGroup key={group} heading={group}>
                  {items
                    .filter((row) => row.group === group)
                    .map((row) => (
                      <CommandItem
                        key={row.id}
                        value={row.id}
                        keywords={[
                          row.title,
                          row.source ?? '',
                          row.description ?? '',
                          ...(row.keywords ?? []),
                        ]}
                        disabled={row.disabled}
                        onSelect={() => {
                          onChoose(row.id);
                          setOpen(false);
                        }}
                        className="items-start gap-2 py-2"
                      >
                        <span className="mt-0.5 size-4 shrink-0 text-muted-foreground">
                          {row.icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 items-baseline gap-2">
                            <span className="truncate font-medium">{row.title}</span>
                            {row.source ? (
                              <span className="truncate text-xs text-muted-foreground">
                                {row.source}
                              </span>
                            ) : null}
                            {row.state ? (
                              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                                {row.state}
                              </span>
                            ) : null}
                          </span>
                          {row.description ? (
                            <span className="line-clamp-2 text-xs text-muted-foreground">
                              {row.description}
                            </span>
                          ) : null}
                        </span>
                      </CommandItem>
                    ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
          {footer ? (
            <div className="border-t p-2" onClick={() => setOpen(false)}>
              {footer}
            </div>
          ) : null}
        </PopoverContent>
      ) : null}
    </Popover>
  );
}

/** Selected capabilities stay compact; the shared picker searches the full catalog on demand. */
export function CapabilitySelection({
  label,
  items,
  values,
  onChange,
  pending,
  error,
}: {
  label: string;
  items: CapabilityOption[];
  values: string[];
  onChange: (values: string[]) => void;
  pending?: boolean;
  error?: string;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <CapabilityPicker
        label={label}
        items={items.map((row) => ({
          ...row,
          disabled: row.disabled || values.includes(row.id),
          state: values.includes(row.id) ? 'Selected' : row.state,
        }))}
        pending={pending}
        error={error}
        onChoose={(id) => onChange([...values, id])}
      >
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          aria-label={`Choose ${label.toLowerCase()}`}
        >
          Choose…
        </Button>
      </CapabilityPicker>
      {values.length ? (
        <ul className="grid gap-1">
          {values.map((value) => {
            const row = items.find((item) => item.id === value);
            return (
              <li
                key={value}
                className="flex min-w-0 items-center gap-2 rounded-md border px-3 py-1"
              >
                <span className="size-4 shrink-0 text-muted-foreground">{row?.icon}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{row?.title ?? value}</span>
                {row?.source ? (
                  <span className="max-w-36 truncate text-xs text-muted-foreground">
                    {row.source}
                  </span>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${row?.title ?? value}`}
                  onClick={() => onChange(values.filter((item) => item !== value))}
                >
                  <XIcon aria-hidden="true" />
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </fieldset>
  );
}
