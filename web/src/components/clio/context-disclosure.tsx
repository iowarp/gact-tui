import { ChevronRightIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

/** Quiet disclosure shared by the context's sources, snapshot and settings. */
export function ContextDisclosure({
  label,
  count,
  children,
}: {
  label: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <Collapsible className="group rounded-xl border">
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          aria-label={count === undefined ? label : `${label} ${count}`}
          className="h-11 w-full justify-start rounded-xl px-3 text-sm"
        >
          <span>{label}</span>
          {count !== undefined ? (
            <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">
              {count}
            </span>
          ) : null}
          <ChevronRightIcon
            aria-hidden="true"
            className={`${count === undefined ? 'ml-auto' : ''} size-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90`}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}
