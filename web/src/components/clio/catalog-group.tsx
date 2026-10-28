import { ChevronRightIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

/** Shared marketplace disclosure for the installed plugin and agent catalogs. */
export function CatalogGroup({
  name,
  count,
  filter = '',
  children,
}: {
  name: string;
  count: number;
  filter?: string;
  children: ReactNode;
}) {
  const [choice, setChoice] = useState({ filter, open: true });
  const open = choice.filter === filter ? choice.open : Boolean(filter) || choice.open;
  return (
    <Collapsible
      open={open}
      onOpenChange={(open) => setChoice({ filter, open })}
      className="grid min-w-0 gap-1"
    >
      <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-md px-1 py-2 text-left text-sm font-medium hover:bg-muted/50">
        <ChevronRightIcon
          aria-hidden="true"
          className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-90"
        />
        {name || 'Local'} <span className="text-xs font-normal text-muted-foreground">{count}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}
