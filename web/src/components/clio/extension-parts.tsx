import { EyeIcon, TriangleAlertIcon } from 'lucide-react';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ExtensionMetaPart, ExtensionStatus } from '@/lib/extension-library-entries';
import { MoreIcon } from '@/lib/icon-vocabulary';
import { handleRowMenuKey, ROW_MENU_OPEN_VISIBLE } from '@/lib/settings-row-keys';
import { cn } from '@/lib/utils';
import { IconButton } from './primitives/icon-button';
import { ItemRow } from './primitives/item-row';
import { StatusIndicator } from './primitives/status-indicator';
import { t } from '@lingui/core/macro';

/**
 * Meta parts separated by space alone; the whole line is the hover text when it is cut.
 * A phone-width list drops the addresses and commands after the first part.
 * `wrap` puts a part that doesn't fit on the next line, whole, instead of cutting it.
 */
export function MetaLine({
  parts,
  className,
  wrap = false,
}: {
  parts: readonly (ExtensionMetaPart | string)[];
  className?: string;
  wrap?: boolean;
}) {
  const rows = parts
    .map((part) => (typeof part === 'string' ? { text: part } : part))
    .filter((part) => part.text);
  return (
    <span
      className={cn(wrap && 'flex min-w-0 flex-wrap gap-x-2.5 whitespace-normal', className)}
      title={rows.map((part) => part.text).join(', ')}
    >
      {rows.map((part, index) => (
        <span
          className={cn(
            wrap
              ? 'max-w-full min-w-0 break-words [word-break:auto-phrase]'
              : index
                ? 'ml-2.5'
                : undefined,
            wrap && part.mono && 'truncate',
            part.mono && 'font-mono text-label',
            part.mono && index && '@max-sm:hidden',
          )}
          key={`${index}:${part.text}`}
        >
          {part.text}
        </span>
      ))}
    </span>
  );
}

/** A row's status column: the mark with its words. */
export function EntryStatus({ status }: { status?: ExtensionStatus }) {
  return status ? <StatusIndicator label={status.label} tone={status.tone} /> : undefined;
}

/** The outline button in a row's right slot: Update, Trust, Install. */
export function SlotButton({
  children,
  label,
  onClick,
  disabled,
  reason,
}: {
  children: ReactNode;
  /** The full name when the visible word needs its subject ("Trust the update from clio"). */
  label?: string;
  onClick: () => void;
  disabled?: boolean;
  /** Why the button is disabled, on hover and for screen readers. */
  reason?: string;
}) {
  const button = (
    <Button
      aria-label={disabled && reason ? `${label ?? ''} (${reason})`.trim() : label}
      className="h-7 px-2.5 text-xs"
      disabled={disabled}
      onClick={onClick}
      size="sm"
      variant="outline"
    >
      {children}
    </Button>
  );
  return disabled && reason ? (
    <span className="inline-flex cursor-help" title={reason}>
      {button}
    </span>
  ) : (
    button
  );
}

/**
 * The warning line above a pane's tabs while a source waits for trust: what
 * trusting allows, and the Trust button.
 */
export function TrustBanner({
  message,
  detail,
  action,
  error,
}: {
  message: string;
  /** The longer explanation, on hover. */
  detail?: string;
  action: ReactNode;
  error?: string;
}) {
  return (
    <div className="mb-3 border-b border-border pb-2.5" data-slot="trust-banner">
      <div className="flex min-w-0 items-center gap-2.5">
        <TriangleAlertIcon aria-hidden="true" className="size-4 shrink-0 text-warning" />
        <p
          className="line-clamp-2 min-w-0 flex-1 text-ui leading-5"
          title={detail ? `${message} ${detail}` : message}
        >
          {message}
        </p>
        {action}
      </div>
      {error ? (
        <p className="mt-1.5 pl-6.5 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One extension as an item row. A click or Enter on the row explores it; the
 * eye does the same for pointer and assistive technology. Further actions sit
 * in the hover column, the rest in ⋯.
 */
export function ExtensionRow({
  icon,
  name,
  title = name,
  meta,
  status,
  onExplore,
  exploreLabel = t`Explore ${name}`,
  actions,
  menu,
  slot,
  confirm,
  onDelete,
  selected = false,
  size = 'default',
  aligned = false,
  className,
}: {
  icon: ReactNode;
  /** The accessible subject of the row's actions. */
  name: string;
  title?: string;
  meta?: readonly (ExtensionMetaPart | string)[];
  status?: ExtensionStatus;
  onExplore?: () => void;
  exploreLabel?: string;
  /** Icon buttons after the eye. */
  actions?: ReactNode;
  /** ⋯ menu items; the ⋯ appears only with some. */
  menu?: ReactNode;
  slot?: ReactNode;
  /** An inline confirm (`RowConfirm`) over the status, actions and slot. */
  confirm?: ReactNode;
  /** Delete (⌫) on the row asks to remove it, as its remove action does. */
  onDelete?: () => void;
  selected?: boolean;
  size?: 'default' | 'sm';
  /** Keep the status and slot columns on a row without them, so a mixed list lines up. */
  aligned?: boolean;
  className?: string;
}) {
  const open = (event: MouseEvent<HTMLDivElement>) => {
    // Buttons and menu items (portaled, but still bubbling through React) do their own thing.
    if ((event.target as Element).closest('button, a, input, [role="menuitem"], [role="menu"]'))
      return;
    if (confirm) return;
    onExplore?.();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || confirm) return;
    if (handleRowMenuKey(event)) return;
    if (event.key === 'Enter' && onExplore) {
      event.preventDefault();
      onExplore();
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && onDelete) {
      event.preventDefault();
      onDelete();
    }
  };
  const hasActions = Boolean(onExplore || actions || menu);
  return (
    <ItemRow
      aria-current={selected || undefined}
      className={cn(onExplore && 'cursor-default', ROW_MENU_OPEN_VISIBLE, className)}
      confirm={confirm}
      icon={icon}
      meta={meta?.length ? <MetaLine parts={meta} wrap /> : undefined}
      onClick={onExplore ? open : undefined}
      onKeyDown={onKeyDown}
      selected={selected}
      size={size}
      slot={slot ?? (aligned ? null : undefined)}
      status={status ? <EntryStatus status={status} /> : aligned ? null : undefined}
      tabIndex={onExplore ? 0 : undefined}
      // A long name wraps whole rather than ending in an ellipsis.
      title={
        <span className="block break-words whitespace-normal" title={title}>
          {title}
        </span>
      }
      actions={
        hasActions ? (
          <>
            {onExplore ? (
              <IconButton
                aria-pressed={selected}
                icon={<EyeIcon />}
                label={exploreLabel}
                onClick={onExplore}
              />
            ) : null}
            {actions}
            {menu ? (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <IconButton icon={<MoreIcon />} label={t`More actions for ${name}`} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-52">
                  {menu}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </>
        ) : undefined
      }
    />
  );
}
