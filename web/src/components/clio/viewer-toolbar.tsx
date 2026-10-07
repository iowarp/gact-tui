import { useContext, type ComponentProps, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ViewerToolbarHost } from './viewer-toolbar-context';

/** A single, keyboard-accessible vocabulary for compact viewer actions. */
export function ToolbarAction({
  label,
  className,
  children,
  ...props
}: ComponentProps<typeof Button> & { label: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={label}
            className={cn('size-7 shrink-0 [&_svg]:size-3.5', className)}
            size="icon-sm"
            variant="ghost"
            {...props}
          >
            {children}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Document controls share the artifact's existing toolbar instead of adding a second header. */
export function ViewerToolbarContent({
  children,
  inline = false,
}: {
  children: ReactNode;
  inline?: boolean;
}) {
  const host = useContext(ViewerToolbarHost);
  return host && !inline ? createPortal(children, host) : children;
}
