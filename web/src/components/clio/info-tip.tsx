import { InfoIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface InfoTipProps {
  /** Names what the tip explains, for the icon's accessible name ("About API keys"). */
  label: string;
  children: ReactNode;
  className?: string;
}

/**
 * The on-hover info icon that carries explanatory text (owner's v15 rule: a
 * surface shows labels and state; any explanation lives here, for the people
 * who want it). Focusable, so the tip also opens from the keyboard.
 */
export function InfoTip({ label, children, className }: InfoTipProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-label={label}
            className={cn(
              'inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
              className,
            )}
            data-slot="info-tip"
            type="button"
          >
            <InfoIcon aria-hidden="true" className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="block max-w-xs leading-5" side="top">
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
