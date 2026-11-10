import type { ToolCallers, ToolPermission } from '@clio/core/v3';
import {
  ArrowLeftRightIcon,
  BotIcon,
  CircleCheckIcon,
  CodeIcon,
  OctagonXIcon,
  type LucideIcon,
} from 'lucide-react';
import { HelpIcon } from '@/lib/icon-vocabulary';

export const PERMISSION_ICON: Record<ToolPermission, LucideIcon> = {
  allow: CircleCheckIcon,
  ask: HelpIcon,
  deny: OctagonXIcon,
};

export const CALLERS_ICON: Record<ToolCallers, LucideIcon> = {
  direct: BotIcon,
  code: CodeIcon,
  both: ArrowLeftRightIcon,
};

export const PERMISSIONS = ['allow', 'ask', 'deny'] as const;
export const CALLERS = ['direct', 'code', 'both'] as const;

/*
 * One column template for every row, folding as the table narrows: below
 * 32rem each row is one summary row (the name over its values and outcomes,
 * and › opening one picker for both choices); then Tool, Permission and I/O;
 * from 44rem the approval mode's outcome; from 56rem the script's outcome too.
 * The columns keep the spec's widths (128, 176 and 120px); the sub line
 * carries the outcomes a narrower table folds away.
 */
export const COLUMNS =
  'grid items-center gap-x-2.5 grid-cols-[20px_minmax(0,1fr)_24px] @min-[32rem]/tools:grid-cols-[20px_minmax(0,1fr)_11rem_7.5rem_24px] @min-[44rem]/tools:grid-cols-[20px_minmax(0,1fr)_8rem_11rem_7.5rem_24px] @min-[56rem]/tools:grid-cols-[20px_minmax(0,1fr)_8rem_8rem_11rem_7.5rem_24px]';
export const MODE_CELL = 'hidden min-w-0 @min-[44rem]/tools:flex';
/** Cells a summary row (below 32rem) folds into its sub line and picker. */
export const WIDE = 'hidden @min-[32rem]/tools:flex';
/** Parts of the sub line only a summary row shows. */
export const NARROW_ONLY = '@min-[32rem]/tools:hidden';
export const SCRIPT_CELL = 'hidden min-w-0 @min-[56rem]/tools:flex';

/** The table's fold: 0 summary rows, 1 the choices, 2 with the mode's outcome, 3 with the script's too. */
export type ToolsFold = 0 | 1 | 2 | 3;
const FOLD_REM = [32, 44, 56] as const;

/** The fold the container queries above choose at a content-box width. */
export function toolsFold(width: number, remPx: number): ToolsFold {
  return FOLD_REM.filter((rem) => width >= rem * remPx).length as ToolsFold;
}
