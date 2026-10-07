import { useRef, useState, type ComponentProps } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { RefreshIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { ToolbarAction } from './viewer-toolbar';

type RefreshProps = Omit<ComponentProps<typeof Button>, 'onClick'> & {
  label: string;
  onRefresh: () => unknown | Promise<unknown>;
  refreshing?: boolean;
};

function useRefresh(onRefresh: RefreshProps['onRefresh'], refreshing: boolean) {
  const running = useRef(false);
  const [pending, setPending] = useState(false);
  const refresh = async () => {
    if (running.current || refreshing) return;
    running.current = true;
    setPending(true);
    try {
      await onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Refresh failed. Try again.');
    } finally {
      running.current = false;
      setPending(false);
    }
  };
  return { busy: pending || refreshing, refresh };
}

/** Keep the familiar refresh icon visible throughout the actual request. */
export function RefreshIndicator({
  refreshing,
  className,
}: {
  refreshing: boolean;
  className?: string;
}) {
  return (
    <RefreshIcon
      aria-hidden="true"
      className={cn(refreshing && 'animate-spin motion-reduce:animate-none', className)}
    />
  );
}

/** Refresh feedback for labelled actions, including keyboard and reduced-motion users. */
export function RefreshButton({
  label,
  onRefresh,
  refreshing = false,
  disabled,
  children,
  ...props
}: RefreshProps) {
  const { busy, refresh } = useRefresh(onRefresh, refreshing);
  return (
    <Button
      {...props}
      aria-label={label}
      aria-busy={busy}
      disabled={disabled || busy}
      onClick={() => void refresh()}
    >
      <RefreshIndicator refreshing={busy} />
      {children ?? label}
      {busy ? (
        <span className="sr-only" role="status">
          Refreshing…
        </span>
      ) : null}
    </Button>
  );
}

/** The same pending state in compact viewer and file-browser toolbars. */
export function RefreshAction({
  label,
  onRefresh,
  refreshing = false,
  disabled,
  ...props
}: Omit<RefreshProps, 'children'>) {
  const { busy, refresh } = useRefresh(onRefresh, refreshing);
  return (
    <ToolbarAction
      {...props}
      label={busy ? `${label} — refreshing` : label}
      aria-busy={busy}
      disabled={disabled || busy}
      onClick={() => void refresh()}
    >
      <RefreshIndicator refreshing={busy} />
      {busy ? (
        <span className="sr-only" role="status">
          Refreshing…
        </span>
      ) : null}
    </ToolbarAction>
  );
}
