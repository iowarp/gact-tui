import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ndpOrganizationsSchema } from '@clio/core/v3';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { sourceInputClass } from './source-form-parts';
import { useRepository } from '@/hooks/use-repository';
import { useNdpCache } from '@/hooks/use-ndp-cache';
import { ndpSearchText } from './use-ndp-catalog';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { t } from '@lingui/core/macro';

export type NDPOrganizationChoice = { id: string; endpoint_id: string };

/** Search actual catalog publisher identities without treating them as access grants. */
export function NDPOrganizationFilter({
  value,
  onChange,
  account = 'signed-out',
  cacheEnabled = true,
}: {
  value: NDPOrganizationChoice | null;
  onChange: (choice: NDPOrganizationChoice | null) => void;
  account?: string;
  cacheEnabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const queryKey = ['ndp-organizations', connectionScope(settings), account];
  const cacheReady = useNdpCache(queryKey, ndpOrganizationsSchema, cacheEnabled);
  const organizations = useQuery({
    queryKey,
    queryFn: ({ signal }) => repository.ndpOrganizations(signal),
    enabled: open && cacheReady,
    staleTime: 0,
    refetchOnMount: 'always',
    retry: false,
  });
  const select = (choice: NDPOrganizationChoice | null) => {
    onChange(choice);
    setOpen(false);
  };
  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-label={t`Organization filter`}
          aria-expanded={open}
          className={cn(
            sourceInputClass,
            'inline-flex max-w-full items-center gap-2 border bg-background text-left outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
          )}
        >
          <span className="truncate">{value?.id || t`All organizations`}</span>
          <ChevronDownIcon aria-hidden="true" className="size-3.5 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] overflow-hidden p-0">
        <Command
          className="h-auto min-h-0"
          filter={(text, query) =>
            ndpSearchText(query)
              .split(/\s+/)
              .every((token) => ndpSearchText(text).includes(token))
              ? 1
              : 0
          }
        >
          <CommandInput placeholder={t`Find an organization…`} />
          {organizations.isFetching || !cacheReady ? (
            <p role="status" className="px-3 py-2 text-sm text-muted-foreground">
              {organizations.data ? t`Refreshing organizations…` : t`Loading organizations…`}
            </p>
          ) : null}
          {organizations.isError ? (
            <div role="alert" className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span>
                {organizations.data
                  ? t`Could not refresh. Showing saved organizations.`
                  : t`Organizations unavailable.`}
              </span>
              <Button variant="ghost" size="sm" onClick={() => void organizations.refetch()}>
                {t`Retry`}
              </Button>
            </div>
          ) : null}
          <CommandList className="min-h-0 max-h-[min(18rem,40dvh)] touch-pan-y overscroll-contain">
            <CommandEmpty>{t`No matching organizations.`}</CommandEmpty>
            <CommandItem onSelect={() => select(null)}>
              {t`All organizations`}
              {!value ? <CheckIcon className="ml-auto" /> : null}
            </CommandItem>
            {organizations.data?.organizations.map((item) => (
              <CommandItem
                key={`${item.endpoint_id}/${item.id}`}
                value={`${item.id} ${item.endpoint_name}`}
                onSelect={() => select(item)}
                className="items-start"
              >
                <span className="min-w-0 break-words">
                  {item.id}
                  <span className="block text-xs text-muted-foreground">{item.endpoint_name}</span>
                </span>
                {value?.id === item.id && value.endpoint_id === item.endpoint_id ? (
                  <CheckIcon className="ml-auto shrink-0" />
                ) : null}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
