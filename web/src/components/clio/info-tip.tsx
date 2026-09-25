import { InfoIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/** A small info icon whose tooltip carries detail a label should not spell out. */
export function InfoTip({ label, children }: { label: string; children: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-label={label}
            className="inline-grid size-4 place-items-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-2"
            type="button"
          >
            <InfoIcon aria-hidden="true" className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-72">{children}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
