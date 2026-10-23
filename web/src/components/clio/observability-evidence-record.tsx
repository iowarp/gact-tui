import type { ActivityIcon } from 'lucide-react';
import { ClioStatus, type ClioStatusValue } from './status';

/** One row of session evidence: an icon, a label with its state, and a short detail. */
export function EvidenceRecord({
  detail,
  icon: Icon,
  label,
  state,
}: {
  detail?: string;
  icon: typeof ActivityIcon;
  label: string;
  state: ClioStatusValue;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-medium" title={label}>
            {label}
          </p>
          <ClioStatus className="shrink-0 py-0.5" value={state} />
        </div>
        {detail ? (
          <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{detail}</p>
        ) : null}
      </div>
    </div>
  );
}
