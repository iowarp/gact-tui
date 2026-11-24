import { DataContext } from '@a2ui/web_core/v0_9';
import type { A2uiActionToast } from '@clio/core/v3';
import { toast } from 'sonner';
import type { A2uiProcessorResult } from '@/lib/a2ui/processor-store';
import { resolveRawAction } from '@/lib/a2ui/raw-action';

/**
 * Shows an action reply's toast in its tone. `undo` sends the toast's Undo
 * action back on the surface the original action came from.
 */
export function showActionToast(notice: A2uiActionToast, undo?: () => void): void {
  const options =
    undo && notice.undo ? { action: { label: notice.undo.label, onClick: undo } } : {};
  switch (notice.tone) {
    case 'positive':
      toast.success(notice.message, options);
      return;
    case 'warning':
      toast.warning(notice.message, options);
      return;
    case 'negative':
      toast.error(notice.message, options);
      return;
    default:
      toast(notice.message, options);
  }
}

/**
 * Shows a reply's toast. Its Undo is an action of the same surface, so it is
 * dispatched through that surface's model and takes the same route as any
 * other action there. `model` is read when Undo is pressed, not before.
 */
export function showReplyToast(
  notice: A2uiActionToast,
  model: () => A2uiProcessorResult['model'] | undefined,
  sourceComponentId: string,
): void {
  const undoAction = notice.undo?.action;
  showActionToast(
    notice,
    undoAction
      ? () => {
          const current = model();
          const resolved = current
            ? resolveRawAction(undoAction, new DataContext(current, '/'))
            : undefined;
          if (current && resolved) void current.dispatchAction(resolved, sourceComponentId);
        }
      : undefined,
  );
}
