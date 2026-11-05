import type { ReactNode } from 'react';
import { ChevronRightIcon } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

/** A compact catalog row with details disclosed in place and separate sibling actions. */
export function CatalogItem({
  label,
  icon,
  metadata,
  actions,
  children,
  open,
  onOpenChange,
}: {
  label: string;
  icon: ReactNode;
  metadata?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      className="min-w-0 border-b border-border/60 last:border-b-0"
    >
      <div className="flex min-w-0 items-center gap-1 rounded-md hover:bg-muted/50">
        <CollapsibleTrigger className="group flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-1 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ChevronRightIcon
            aria-hidden="true"
            className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-90"
          />
          <span aria-hidden="true" className="shrink-0 text-muted-foreground [&>svg]:size-4">
            {icon}
          </span>
          <span className="truncate font-medium" title={label}>
            {label}
          </span>{' '}
          <span className="ml-auto flex min-w-0 shrink items-center gap-2 overflow-hidden whitespace-nowrap text-xs text-muted-foreground">
            {metadata}
          </span>
        </CollapsibleTrigger>
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      </div>
      <CollapsibleContent>
        <div className="grid min-w-0 gap-2 pb-3 pl-9 pr-2 text-sm [overflow-wrap:anywhere]">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
