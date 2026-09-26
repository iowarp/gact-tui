/**
 * The interface's ONE icon vocabulary: each action has one icon, used the
 * same way on every screen. Components import the action's name from here,
 * never the glyph from `lucide-react`, so "configure" can never be a gear on
 * one screen, sliders on another and a server-with-cog on a third.
 *
 * `scripts/check_icon_vocabulary.mjs` (part of `pnpm lint`) fails when a
 * component imports one of these glyphs directly.
 *
 * - Settings / Configure / Manage: the gear -- the main Settings navigation,
 *   "configure this item" and "manage these settings" (a list of saved
 *   hosts, say) are one affordance.
 * - Edit: rename or change an item's content in place.
 * - Delete: destroy an item. Remove: take an item out of a list (a filter
 *   token, a hop). Close: dismiss or cancel.
 * - Refresh: fetch or check again (refresh, reload, re-check).
 * - Retry: try a failed step again, regenerate, reset to the start.
 * - Info: an explanation behind hover. Help: guidance about a control.
 * - More: the overflow menu of an item.
 * - Add: create a new item.
 * - Adjust: pick a level on a scale (reasoning effort).
 */
export {
  SettingsIcon,
  SettingsIcon as ConfigureIcon,
  SettingsIcon as ManageIcon,
  PencilIcon as EditIcon,
  Trash2Icon as DeleteIcon,
  XIcon as RemoveIcon,
  XIcon as CloseIcon,
  RefreshCwIcon as RefreshIcon,
  RotateCcwIcon as RetryIcon,
  InfoIcon,
  CircleHelpIcon as HelpIcon,
  EllipsisIcon as MoreIcon,
  PlusIcon as AddIcon,
  SlidersHorizontalIcon as AdjustIcon,
  SaveIcon,
} from 'lucide-react';
