import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/** The spec type scale from `index.css`, so `cn()` treats `text-ui` as a size, not a color. */
export const TYPE_SCALE = ["caption", "label", "meta", "menu", "ui", "h3", "title", "welcome"] as const

const twMerge = extendTailwindMerge({ extend: { theme: { text: [...TYPE_SCALE] } } })

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
