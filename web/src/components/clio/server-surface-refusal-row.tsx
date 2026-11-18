import { t, ph } from '@lingui/core/macro';
import { CircleOffIcon } from 'lucide-react';
import { serverOwnerName, serverSurfaceReason } from '@/lib/a2ui/server-surface';
import type { ServerSurfaceRefusal } from '@/lib/a2ui/server-surface-refusals';
import { TechnicalDetails } from './technical-details';

/**
 * A plugin view CLIO would not show (HS1): one quiet line where the view would
 * have been, with why and the ids under Technical details. The person did not
 * ask for it, so it is not a toast.
 */
export function ServerSurfaceRefusalRow({ refusal }: { refusal: ServerSurfaceRefusal }) {
  const name = refusal.plugin || refusal.server ? serverOwnerName(refusal) : '';
  const reason =
    serverSurfaceReason(refusal.reason) ??
    (refusal.detail || t`The view did not meet the rules for plugin views.`);
  const facts: [string, string][] = [
    [t`Plugin`, refusal.plugin],
    [t`Server`, refusal.server],
    [t`Tool`, refusal.tool],
    [t`Address`, refusal.uri],
    [t`Code`, refusal.reason],
  ];
  return (
    <TechnicalDetails
      beside={
        <span className="flex min-w-0 items-center gap-1.5">
          <CircleOffIcon aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate">
            {name ? t`A view from ${ph({ name })} was not shown` : t`A plugin's view was not shown`}
          </span>
        </span>
      }
      className="min-w-0 text-xs text-muted-foreground"
      title={t`Technical details`}
    >
      <div className="mt-1 grid gap-1 pl-5" data-slot="server-surface-refusal">
        <p className="text-pretty">{reason}</p>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
          {facts
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div className="contents" key={label}>
                <dt>{label}</dt>
                <dd className="truncate font-mono">{value}</dd>
              </div>
            ))}
        </dl>
      </div>
    </TechnicalDetails>
  );
}
