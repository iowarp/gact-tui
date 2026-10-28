import { useEffect } from "react"
import { useTheme } from "@/providers/appearance-provider"
import { Toaster as Sonner, toast, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

/**
 * Toasts sit at the top, below the 40px page header: at the bottom they
 * covered the composer's Send/stop control and its neighbours, and on the
 * right they sat over the side panel's rows. `expand` lays several toasts out
 * one under another instead of the collapsed deck, whose overlapping layers
 * left two notices drawn over each other.
 */
const TOAST_OFFSET = { top: 48 } as const
const TOAST_MOBILE_OFFSET = { top: 48, left: 16, right: 16 } as const

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme()

  return (
    <Sonner
      theme={resolvedTheme.dark ? "dark" : "light"}
      className="toaster group"
      position="top-center"
      offset={TOAST_OFFSET}
      mobileOffset={TOAST_MOBILE_OFFSET}
      expand
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

/**
 * A dialog takes over from the notices shown before it opened: a toast left
 * over from the action that led here would otherwise sit on the dialog's
 * title or actions. Toasts raised while the dialog is open still show.
 */
/* Render it inside the dialog's content, which mounts only while it is open. */
function DismissToastsOnOpen() {
  useEffect(() => {
    toast.dismiss()
  }, [])
  return null
}

export { DismissToastsOnOpen, Toaster }
