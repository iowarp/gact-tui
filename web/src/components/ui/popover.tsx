import * as React from "react"
import { ModalShield, useShieldFocusOutside, useShieldFocusReturn, useTriggerRef } from "./modal-shield"
import { useOverlayContainer } from "./overlay-container"
import { Popover as PopoverPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

const PopoverModal = React.createContext(false)
const PopoverTriggerRef = React.createContext<React.RefObject<HTMLElement | null>>({ current: null })

/**
 * `modal` shields the page; Radix stays non-modal (see DropdownMenu). Popover
 * content always loops Tab inside, and the shield stops outside presses.
 */
function Popover({
  modal = false,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  const trigger = React.useRef<HTMLElement | null>(null)
  return (
    <PopoverModal.Provider value={modal}>
      <PopoverTriggerRef.Provider value={trigger}>
        <PopoverPrimitive.Root data-slot="popover" modal={false} {...props} />
      </PopoverTriggerRef.Provider>
    </PopoverModal.Provider>
  )
}

function PopoverTrigger({
  ref,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  const triggerRef = useTriggerRef(React.useContext(PopoverTriggerRef), ref)
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" ref={triggerRef} {...props} />
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  onCloseAutoFocus,
  onFocusOutside,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  const container = useOverlayContainer()
  const modal = React.useContext(PopoverModal)
  const trigger = React.useContext(PopoverTriggerRef)
  const closeFocus = useShieldFocusReturn(modal, trigger, onCloseAutoFocus)
  const focusOutside = useShieldFocusOutside(modal, onFocusOutside)
  return (
    <>
      {modal ? (
        <PopoverPrimitive.Portal container={container}>
          <ModalShield container={container} />
        </PopoverPrimitive.Portal>
      ) : null}
      <PopoverPrimitive.Portal container={container}>
        <PopoverPrimitive.Content
          data-slot="popover-content"
          align={align}
          sideOffset={sideOffset}
          className={cn(
            "z-50 flex w-72 origin-(--radix-popover-content-transform-origin) flex-col gap-2.5 rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          onCloseAutoFocus={closeFocus}
          onFocusOutside={focusOutside}
          {...props}
        />
      </PopoverPrimitive.Portal>
    </>
  )
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-0.5 text-sm", className)}
      {...props}
    />
  )
}

function PopoverTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <div
      data-slot="popover-title"
      className={cn("font-medium", className)}
      {...props}
    />
  )
}

function PopoverDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="popover-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
}
