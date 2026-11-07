import * as React from "react"
import { HoverCard as HoverCardPrimitive, Slot } from "radix-ui"

import { cn } from "@/lib/utils"

function HoverCard({
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Root>) {
  return <HoverCardPrimitive.Root data-slot="hover-card" {...props} />
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
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Trigger>) {
  return (
    <HoverCardPrimitive.Trigger asChild data-slot="hover-card-trigger" {...props}>
      <TouchPassiveSlot ownTouchStart={onTouchStart}>
        {asChild ? children : <a>{children}</a>}
      </TouchPassiveSlot>
    </HoverCardPrimitive.Trigger>
  )
}

function HoverCardContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Content>) {
  return (
    <HoverCardPrimitive.Portal data-slot="hover-card-portal">
      <HoverCardPrimitive.Content
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
