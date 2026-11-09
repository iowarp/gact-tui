import type { ReactNode } from 'react';

/** A chart's title row: its heading and its actions. A dashboard chart adds its units caption. */
export function ChartHeader({
  dashboard,
  heading,
  caption,
  actions,
}: {
  dashboard: boolean;
  heading: string;
  caption?: string;
  actions: ReactNode;
}) {
  return (
    <div className="mb-2 flex min-w-0 items-start gap-3">
      {dashboard ? (
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[13px] font-medium leading-snug" title={heading}>
            {heading}
          </h3>
          {caption ? (
            <p
              className="truncate text-[11.5px] leading-snug text-muted-foreground"
              title={caption}
            >
              {caption}
            </p>
          ) : null}
        </div>
      ) : (
        <h3
          className="min-w-0 flex-1 line-clamp-2 text-sm font-medium leading-snug"
          title={heading}
        >
          {heading}
        </h3>
      )}
      <div className="flex shrink-0 items-center gap-0.5">{actions}</div>
    </div>
  );
}
