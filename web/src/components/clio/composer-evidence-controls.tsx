import type { ReactNode } from 'react';

/** Keep session evidence beside the pills, with optional detail when space permits. */
export function ClioComposerEvidenceControls({
  activityControl,
  workSummary,
}: {
  activityControl?: ReactNode;
  workSummary?: ReactNode;
}) {
  return (
    <div className="ml-auto flex min-w-0 shrink-0 items-center justify-end gap-1">
      {workSummary ? (
        <div className="hidden min-w-0 max-w-48 @min-[60rem]/composer:block">{workSummary}</div>
      ) : null}
      {activityControl ? <div className="min-w-0 max-w-60">{activityControl}</div> : null}
    </div>
  );
}
