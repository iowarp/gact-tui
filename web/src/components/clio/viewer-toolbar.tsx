import { useContext, type ComponentProps, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { IconButton, type IconButtonProps } from './primitives/icon-button';
import { ViewerToolbarHost } from './viewer-toolbar-context';

/**
 * A compact viewer action: the shared IconButton (required name, hover name
 * with its key, inside focus ring) at the toolbar's 14px icon size.
 */
export function ToolbarAction({
  label,
  className,
  children,
  size,
  ...props
}: Omit<IconButtonProps, 'icon' | 'size'> & {
  children: ReactNode;
  /** Toolbar actions are 28px; only `icon-xs` asks for the 22px dense size. */
  size?: ComponentProps<typeof Button>['size'];
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <IconButton
        label={label}
        icon={children}
        size={size === 'icon-xs' ? 'sm' : 'default'}
        className={cn('shrink-0 [&_svg]:size-3.5', className)}
        {...props}
      />
    </TooltipProvider>
  );
}

/** Renderers contribute controls to the shared file toolbar instead of adding headers. */
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
