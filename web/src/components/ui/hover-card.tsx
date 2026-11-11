import * as React from "react"
import { HoverCard as HoverCardPrimitive, Slot } from "radix-ui"

import { cn } from "@/lib/utils"
import { isBehindModal, subscribeToModals } from "./modal-focus"
import { useOverlayContainer } from "./overlay-container"

const HoverCardTriggerRef = React.createContext<React.RefObject<HTMLElement | null> | null>(null)

/**
 * A preview never opens behind a dialog, sheet or menu, and one already open
 * closes when a dialog or sheet opens above it.
 * Otherwise a row's hover timer or focus keeps it open under a dialog the
 * row's menu just opened, and it takes that dialog's first Esc.
 */
function HoverCard({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Root>) {
  const triggerRef = React.useRef<HTMLElement | null>(null)
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen)
  const changeOpen = React.useCallback(
    (next: boolean) => {
      if (next && isBehindModal(triggerRef.current)) return
      if (openProp === undefined) setUncontrolledOpen(next)
      onOpenChange?.(next)
    },
    [onOpenChange, openProp]
  )
  const open = openProp ?? uncontrolledOpen
  React.useEffect(() => {
    if (!open) return
    const closeIfBehindModal = () => {
      if (isBehindModal(triggerRef.current)) changeOpen(false)
    }
    closeIfBehindModal()
    return subscribeToModals(closeIfBehindModal)
  }, [changeOpen, open])
  return (
    <HoverCardTriggerRef.Provider value={triggerRef}>
      <HoverCardPrimitive.Root
        data-slot="hover-card"
        open={open}
        onOpenChange={changeOpen}
        {...props}
      />
    </HoverCardTriggerRef.Provider>
  )
}

type TouchStartHandler = React.TouchEventHandler<HTMLAnchorElement>

/**
 * Radix's trigger adds an `onTouchStart` that calls `preventDefault()`. React
 * listens for touch events passively, so that call never takes effect and the
 * browser logs "Unable to preventDefault inside passive event listener
 * invocation" on every tap. If it did take effect it would also cancel the
 * tap's click, so the handler is dropped here rather than made non-passive.
 * Only the caller's own `onTouchStart`, if any, reaches the element.
 */
function TouchPassiveSlot({
  onTouchStart: _radixTouchStart,
  ownTouchStart,
  ...props
}: React.ComponentProps<typeof Slot.Root> & { ownTouchStart?: TouchStartHandler }) {
  return <Slot.Root {...props} onTouchStart={ownTouchStart} />
}

function HoverCardTrigger({
  asChild = false,
  children,
  onTouchStart,
  ref,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Trigger>) {
  const triggerRef = React.useContext(HoverCardTriggerRef)
  const composedRef = React.useCallback(
    (node: HTMLAnchorElement | null) => {
      if (triggerRef) triggerRef.current = node
      if (typeof ref === "function") return ref(node)
      if (ref) ref.current = node
    },
    [ref, triggerRef]
  )
  return (
    <HoverCardPrimitive.Trigger
      asChild
      data-slot="hover-card-trigger"
      ref={composedRef}
      {...props}
    >
      <TouchPassiveSlot ownTouchStart={onTouchStart}>
        {asChild ? children : <a>{children}</a>}
      </TouchPassiveSlot>
    </HoverCardPrimitive.Trigger>
  )
}

/** Surfaces on a layer above the page: a card opened from one must sit above it. */
const LAYERED_OPENER =
  "[data-radix-popper-content-wrapper], [data-slot='dialog-content'], [data-slot='alert-dialog-content']"

function HoverCardContent({
  className,
  align = "center",
  sideOffset = 4,
  ref,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Content>) {
  const triggerRef = React.useContext(HoverCardTriggerRef)
  // A card opened inside a popover, menu or dialog is marked nested, and
  // index.css raises its popper wrapper onto the tooltip layer. Page-level
  // cards stay below dialogs.
  const layeredRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (node) {
        if (triggerRef?.current?.closest(LAYERED_OPENER)) node.dataset.overlayLayer = "nested"
        else delete node.dataset.overlayLayer
      }
      if (typeof ref === "function") return ref(node)
      if (ref) ref.current = node
    },
    [ref, triggerRef]
  )
  return (
    <HoverCardPrimitive.Portal container={useOverlayContainer()} data-slot="hover-card-portal">
      <HoverCardPrimitive.Content
        ref={layeredRef}
        data-slot="hover-card-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-64 origin-(--radix-hover-card-content-transform-origin) rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      />
    </HoverCardPrimitive.Portal>
  )
}

export { HoverCard, HoverCardTrigger, HoverCardContent }
