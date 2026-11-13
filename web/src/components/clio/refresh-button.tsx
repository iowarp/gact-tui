import { useCallback, useContext, useMemo, useRef, useState, type ComponentProps } from 'react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { RefreshIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { NamedTooltip } from './primitives/icon-button';
import { ToolbarAction } from './viewer-toolbar';
import { FileViewerActionRegistry, useFileViewerActions } from './file-viewer-action-context';
import { t } from '@lingui/core/macro';

type RefreshProps = Omit<ComponentProps<typeof Button>, 'onClick'> & {
  label: string;
  onRefresh: () => unknown | Promise<unknown>;
  refreshing?: boolean;
};

function useRefresh(onRefresh: RefreshProps['onRefresh'], refreshing: boolean) {
  const running = useRef(false);
  const [pending, setPending] = useState(false);
  const refresh = useCallback(async () => {
    if (running.current || refreshing) return;
    running.current = true;
    setPending(true);
    try {
      await onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t`Refresh failed. Try again.`);
    } finally {
      running.current = false;
      setPending(false);
    }
  }, [onRefresh, refreshing]);
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
  idleIcon: IdleIcon,
  iconOnly = false,
  ...props
}: RefreshProps & {
  idleIcon?: LucideIcon;
  /** Show only the icon; the label becomes its hover name. */
  iconOnly?: boolean;
}) {
  const { busy, refresh } = useRefresh(onRefresh, refreshing);
  const { title, ...buttonProps } = props;
  const button = (
    <Button
      {...buttonProps}
      title={iconOnly ? undefined : title}
      aria-label={label}
      aria-busy={busy}
      disabled={disabled || busy}
      onClick={() => void refresh()}
    >
      {IdleIcon && !busy ? <IdleIcon aria-hidden="true" /> : <RefreshIndicator refreshing={busy} />}
      {iconOnly ? null : (children ?? label)}
      {busy ? (
        <span className="sr-only" role="status">
          {t`Refreshing…`}
        </span>
      ) : null}
    </Button>
  );
  if (!iconOnly) return button;
  return (
    <NamedTooltip label={title ?? label} side="top">
      {button}
    </NamedTooltip>
  );
}

/** The same pending state in compact viewer and file-browser toolbars. */
export function RefreshAction({
  label,
  onRefresh,
  refreshing = false,
  disabled,
  secondary = false,
  ...props
}: Omit<RefreshProps, 'children'> & { secondary?: boolean }) {
  const { busy, refresh } = useRefresh(onRefresh, refreshing);
  const registry = useContext(FileViewerActionRegistry);
  const actions = useMemo(
    () =>
      secondary
        ? [
            {
              label: busy ? t`${label} — refreshing` : label,
              icon: RefreshIcon,
              onSelect: refresh,
              disabled: Boolean(disabled || busy),
              pending: busy,
            },
          ]
        : [],
    [secondary, label, busy, refresh, disabled],
  );
  useFileViewerActions(actions);
  if (secondary && registry) return null;
  return (
    <ToolbarAction
      {...props}
      label={busy ? t`${label} — refreshing` : label}
      aria-busy={busy}
      disabled={disabled || busy}
      onClick={() => void refresh()}
    >
      <RefreshIndicator refreshing={busy} />
      {busy ? (
        <span className="sr-only" role="status">
          {t`Refreshing…`}
        </span>
      ) : null}
    </ToolbarAction>
  );
}
