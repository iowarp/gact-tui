import { t, ph } from '@lingui/core/macro';
import { useRef } from 'react';
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
  const detailsRef = useRef<HTMLDivElement>(null);
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
  // Opened on the last row, the facts would land under the composer: bring them up.
  const reveal = (open: boolean) => {
    if (!open) return;
    requestAnimationFrame(() =>
      detailsRef.current?.scrollIntoView({
        block: 'nearest',
        behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
      }),
    );
  };
  return (
    <TechnicalDetails
      beside={
        <span className="flex min-w-0 flex-1 items-start gap-1.5">
          <CircleOffIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 text-pretty [overflow-wrap:anywhere]">
            {name ? t`A view from ${ph({ name })} was not shown` : t`A plugin's view was not shown`}
          </span>
        </span>
      }
      className="min-w-0 text-xs text-muted-foreground"
      onOpenChange={reveal}
      rowClassName="items-start gap-2"
      title={t`Technical details`}
    >
      <div
        className="mt-1 grid scroll-mb-14 gap-1 pl-5"
        data-slot="server-surface-refusal"
        ref={detailsRef}
      >
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
