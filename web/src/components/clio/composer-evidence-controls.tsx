import type { ReactNode } from 'react';

/**
 * Session evidence in the composer row, just left of the model. It never wraps
 * the row: the summary appears only on wide composers and the activity control
 * only once there is room beside the other controls.
 */
export function ClioComposerEvidenceControls({
  activityControl,
  workSummary,
}: {
  activityControl?: ReactNode;
  workSummary?: ReactNode;
}) {
  if (!activityControl && !workSummary) return null;
  return (
    <div className="flex min-w-0 shrink items-center gap-1 overflow-hidden whitespace-nowrap">
      {workSummary ? (
        <div className="hidden max-w-48 min-w-0 truncate @min-[60rem]/composer:block">
          {workSummary}
        </div>
      ) : null}
      {activityControl ? (
        <div className="hidden max-w-40 min-w-0 @min-[36rem]/composer:block">{activityControl}</div>
      ) : null}
    </div>
  );
}
