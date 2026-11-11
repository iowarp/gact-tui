/**
 * The interface's ONE icon vocabulary: each action has one icon, used the
 * same way on every screen. Components import the action's name from here,
 * never the glyph from `lucide-react`, so "configure" can never be a gear on
 * one screen, sliders on another and a server-with-cog on a third.
 *
 * `scripts/check_icon_vocabulary.mjs` (part of `pnpm lint`) fails when a
 * component imports one of these glyphs directly.
 *
 * - Settings / Configure / Manage: the vertical sliders -- the main Settings
 *   navigation, "configure this item" and "manage these settings" (a list of
 *   saved hosts, say) are one affordance. The spec draws them all with its
 *   `#gear` symbol, which is these sliders.
 * - Edit: rename or change an item's content in place.
 * - Delete: destroy an item. Remove: take an item out of a list (a filter
 *   token, a hop). Close: dismiss or cancel.
 * - Refresh: fetch or check again (refresh, reload, re-check).
 * - Connection check: check a provider's connection and sign-in.
 * - Retry: try a failed step again, regenerate, reset to the start.
 * - Info: an explanation behind hover. Help: guidance about a control.
 * - More: the overflow menu of an item.
 * - Add: create a new item (a workspace, an agent).
 * - New conversation: the pen-on-a-page; always a new conversation, never + .
 * - Adjust: pick a level on a scale (reasoning effort).
 * - Connection settings: the same sliders, as the CLIO menu's details draw
 *   the link to the agent's connection page (spec v15).
 * - Settings window: the cog in the window's own title bar (spec `#cog`),
 *   distinct from the sliders that link to it.
 */
export {
  SlidersVerticalIcon as SettingsIcon,
  CogIcon as SettingsWindowIcon,
  SlidersVerticalIcon as ConfigureIcon,
  SlidersVerticalIcon as ManageIcon,
  PencilIcon as EditIcon,
  Trash2Icon as DeleteIcon,
  XIcon as RemoveIcon,
  XIcon as CloseIcon,
  RefreshCwIcon as RefreshIcon,
  PlugZapIcon as CheckConnectionIcon,
  RotateCcwIcon as RetryIcon,
  InfoIcon,
  CircleHelpIcon as HelpIcon,
  EllipsisIcon as MoreIcon,
  PlusIcon as AddIcon,
  SquarePenIcon as NewConversationIcon,
  SlidersHorizontalIcon as AdjustIcon,
  SlidersVerticalIcon as ConnectionSettingsIcon,
  SaveIcon,
  TargetIcon as GoalIcon,
  Repeat2Icon as LoopIcon,
  CalendarClockIcon as ScheduleIcon,
} from 'lucide-react';
