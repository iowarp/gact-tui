'use client';

import * as React from 'react';
import {
  ModalShield,
  useShieldFocusOutside,
  useShieldFocusReturn,
  useTriggerRef,
} from './modal-shield';
import { useOverlayContainer } from './overlay-container';
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';

import { useOpenedByRef } from '@/lib/input-modality';
import { cn } from '@/lib/utils';
import { CheckIcon, ChevronRightIcon } from 'lucide-react';

const DropdownMenuModal = React.createContext(true);
const DropdownMenuTriggerRef = React.createContext<React.RefObject<HTMLElement | null>>({
  current: null,
});

/**
 * A single unmodified letter runs the item that shows it in its key column
 * (`menuKey`), as in conversation-states/09. Letters no item claims fall
 * through to the menu's type-to-find.
 */
function runMenuKey(event: React.KeyboardEvent<HTMLDivElement>) {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key.length !== 1 || !/[\p{L}\p{N}]/u.test(event.key)) return;
  const menu = (event.target as HTMLElement).closest(
    '[data-slot=dropdown-menu-content],[data-slot=dropdown-menu-sub-content]',
  );
  if (menu !== event.currentTarget) return;
  const item = Array.from(
    menu.querySelectorAll<HTMLElement>('[data-menu-key]:not([data-disabled])'),
  ).find(
    (candidate) =>
      candidate.closest(
        '[data-slot=dropdown-menu-content],[data-slot=dropdown-menu-sub-content]',
      ) === menu && candidate.dataset.menuKey?.toLowerCase() === event.key.toLowerCase(),
  );
  if (!item) return;
  event.preventDefault();
  item.click();
}

/**
 * Append the key column. An `asChild` item must keep exactly one child, so the
 * key goes inside that child instead of beside it.
 */
function withMenuKey(children: React.ReactNode, menuKey?: string, asChild?: boolean) {
  if (!menuKey) return children;
  const key = <DropdownMenuKey>{menuKey}</DropdownMenuKey>;
  if (asChild && React.isValidElement<{ children?: React.ReactNode }>(children)) {
    return React.cloneElement(children, undefined, children.props.children, key);
  }
  return (
    <>
      {children}
      {key}
    </>
  );
}

/** The fixed 22px key column at a menu row's end. */
function DropdownMenuKey({ children }: { children: string }) {
  return (
    <kbd
      aria-hidden="true"
      data-slot="dropdown-menu-key"
      className="ml-auto w-[22px] shrink-0 text-right font-mono text-[10.5px] font-normal text-faint"
    >
      {children}
    </kbd>
  );
}

/**
 * `modal` (the default) blocks the page with a ModalShield. Radix itself always
 * runs non-modal: its modal mode adds only aria-hidden on the app root and a
 * scroll-lock `<style>` in `<head>`, each a document-wide restyle (~100 ms) on
 * every open. The shield already stops outside presses, the overlay host
 * already holds the body lock, and Radix menus keep Tab inside regardless.
 */
function DropdownMenu({
  modal = true,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  const trigger = React.useRef<HTMLElement | null>(null);
  return (
    <DropdownMenuModal.Provider value={modal}>
      <DropdownMenuTriggerRef.Provider value={trigger}>
        <DropdownMenuPrimitive.Root data-slot="dropdown-menu" modal={false} {...props} />
      </DropdownMenuTriggerRef.Provider>
    </DropdownMenuModal.Provider>
  );
}

function DropdownMenuPortal({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
  return <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />;
}

function DropdownMenuTrigger({
  ref,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  const triggerRef = useTriggerRef(React.useContext(DropdownMenuTriggerRef), ref);
  return (
    <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" ref={triggerRef} {...props} />
  );
}

function DropdownMenuContent({
  className,
  align = 'start',
  sideOffset = 4,
  collisionPadding = 8,
  onKeyDown,
  onCloseAutoFocus,
  onFocusOutside,
  onPointerDownOutside,
  ref,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  const openedBy = useOpenedByRef(ref);
  const container = useOverlayContainer();
  const modal = React.useContext(DropdownMenuModal);
  const trigger = React.useContext(DropdownMenuTriggerRef);
  // A press on the trigger is the trigger's own toggle. A menu still fading out
  // listens for outside presses, so pressing the trigger again during that
  // fade would reopen the menu and have this closing layer dismiss it at once.
  const pointerDownOutside = React.useCallback(
    (event: Parameters<NonNullable<typeof onPointerDownOutside>>[0]) => {
      onPointerDownOutside?.(event);
      if (trigger.current?.contains(event.target as Node)) event.preventDefault();
    },
    [onPointerDownOutside, trigger],
  );
  const closeFocus = useShieldFocusReturn(modal, trigger, onCloseAutoFocus);
  const focusOutside = useShieldFocusOutside(modal, onFocusOutside);
  return (
    <>
      {modal ? (
        <DropdownMenuPrimitive.Portal container={container}>
          <ModalShield container={container} />
        </DropdownMenuPrimitive.Portal>
      ) : null}
      <DropdownMenuPrimitive.Portal container={container}>
        <DropdownMenuPrimitive.Content
          ref={openedBy}
          data-slot="dropdown-menu-content"
          sideOffset={sideOffset}
          collisionPadding={collisionPadding}
          align={align}
          className={cn(
            'z-50 max-h-(--radix-dropdown-menu-content-available-height) w-max min-w-32 max-w-(--radix-dropdown-menu-content-available-width) origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-[10px] bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-border duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:overflow-hidden data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
            className,
          )}
          onKeyDown={(event) => {
            onKeyDown?.(event);
            runMenuKey(event);
          }}
          onCloseAutoFocus={closeFocus}
          onFocusOutside={focusOutside}
          onPointerDownOutside={pointerDownOutside}
          {...props}
        />
      </DropdownMenuPrimitive.Portal>
    </>
  );
}

function DropdownMenuGroup({ ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

/**
 * Radix moves focus to the menu when the pointer leaves an item, even while the menu
 * fades out. An item that opens a dialog would lose the dialog's focus that way: the
 * backdrop arrives under the pointer, the closing menu takes focus, then drops it on
 * the page as it unmounts.
 */
function useClosingMenuPointerLeave(
  onPointerLeave: React.PointerEventHandler<HTMLDivElement> | undefined,
) {
  return React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      onPointerLeave?.(event);
      const menu = event.currentTarget.closest('[role="menu"]');
      if (menu?.getAttribute('data-state') === 'closed') event.preventDefault();
    },
    [onPointerLeave],
  );
}

function DropdownMenuItem({
  className,
  inset,
  variant = 'default',
  menuKey,
  children,
  onPointerLeave,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean;
  variant?: 'default' | 'destructive';
  /** The one letter that runs this item while its menu is open. */
  menuKey?: string;
}) {
  const pointerLeave = useClosingMenuPointerLeave(onPointerLeave);
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      data-menu-key={menuKey?.toLowerCase()}
      className={cn(
        "group/dropdown-menu-item relative flex cursor-default items-center whitespace-nowrap gap-2.5 min-h-[30px] rounded-[6px] px-2 py-1 text-[12.5px] outline-hidden select-none focus:bg-menu-highlight focus-visible:outline-[1.5px] focus-visible:outline-primary focus-visible:-outline-offset-[1.5px] focus:text-foreground not-data-[variant=destructive]:focus:**:text-foreground data-inset:pl-7 data-[variant=destructive]:text-destructive-text data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive-text dark:data-[variant=destructive]:focus:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 data-[variant=destructive]:*:[svg]:text-destructive",
        className,
      )}
      {...props}
      onPointerLeave={pointerLeave}
    >
      {withMenuKey(children, menuKey, props.asChild)}
    </DropdownMenuPrimitive.Item>
  );
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  onPointerLeave,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem> & {
  inset?: boolean;
}) {
  const pointerLeave = useClosingMenuPointerLeave(onPointerLeave);
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      className={cn(
        "relative flex cursor-default items-center whitespace-nowrap gap-2.5 min-h-[30px] rounded-[6px] py-1 pr-8 pl-2 text-[12.5px] outline-hidden select-none focus:bg-menu-highlight focus-visible:outline-[1.5px] focus-visible:outline-primary focus-visible:-outline-offset-[1.5px] focus:text-foreground focus:**:text-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className,
      )}
      checked={checked}
      {...props}
      onPointerLeave={pointerLeave}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

function DropdownMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
  return <DropdownMenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />;
}

function DropdownMenuRadioItem({
  className,
  children,
  inset,
  onPointerLeave,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem> & {
  inset?: boolean;
}) {
  const pointerLeave = useClosingMenuPointerLeave(onPointerLeave);
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      className={cn(
        "relative flex cursor-default items-center whitespace-nowrap gap-2.5 min-h-[30px] rounded-[6px] py-1 pr-8 pl-2 text-[12.5px] outline-hidden select-none focus:bg-menu-highlight focus-visible:outline-[1.5px] focus-visible:outline-primary focus-visible:-outline-offset-[1.5px] focus:text-foreground focus:**:text-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className,
      )}
      {...props}
      onPointerLeave={pointerLeave}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-radio-item-indicator"
      >
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & {
  inset?: boolean;
}) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        'px-2 pt-1.5 pb-1 text-[11px] font-medium text-muted-foreground data-inset:pl-7',
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
}

function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn('ml-auto pl-4 text-[11.5px] text-muted-foreground', className)}
      {...props}
    />
  );
}

function DropdownMenuSub({ ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
  return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />;
}

function DropdownMenuSubTrigger({
  className,
  inset,
  menuKey,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & {
  inset?: boolean;
  /** The one letter that opens this submenu while its menu is open. */
  menuKey?: string;
}) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      data-menu-key={menuKey?.toLowerCase()}
      className={cn(
        "flex cursor-default items-center whitespace-nowrap gap-2.5 min-h-[30px] rounded-[6px] px-2 py-1 text-[12.5px] outline-hidden select-none focus:bg-menu-highlight focus-visible:outline-[1.5px] focus-visible:outline-primary focus-visible:-outline-offset-[1.5px] focus:text-foreground not-data-[variant=destructive]:focus:**:text-foreground data-inset:pl-7 data-open:bg-menu-highlight data-open:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className,
      )}
      {...props}
    >
      {children}
      {menuKey ? <DropdownMenuKey>{menuKey}</DropdownMenuKey> : null}
      <ChevronRightIcon
        className={menuKey ? 'text-muted-foreground' : 'ml-auto text-muted-foreground'}
      />
    </DropdownMenuPrimitive.SubTrigger>
  );
}

function DropdownMenuSubContent({
  className,
  collisionPadding = 8,
  onKeyDown,
  ref,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  const openedBy = useOpenedByRef(ref);
  return (
    <DropdownMenuPrimitive.Portal container={useOverlayContainer()}>
      <DropdownMenuPrimitive.SubContent
        ref={openedBy}
        data-slot="dropdown-menu-sub-content"
        collisionPadding={collisionPadding}
        className={cn(
          'z-50 w-max min-w-[96px] max-w-(--radix-dropdown-menu-content-available-width) origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-[10px] bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-border duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
          className,
        )}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          runMenuKey(event);
        }}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
};
