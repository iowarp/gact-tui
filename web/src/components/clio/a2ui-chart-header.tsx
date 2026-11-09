import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

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
    // A narrow dashboard gives the title the full width. Its actions wrap below it on touch;
    // with a pointer they take no line and float over the chart's top corner.
    <div
      className={cn(
        'mb-2 flex min-w-0 items-start gap-3',
        dashboard && '@max-[24rem]/dashboard:flex-wrap @max-[24rem]/dashboard:gap-y-1',
      )}
    >
      {dashboard ? (
        // A narrow pane wraps the title and units to a second line between words.
        <div className="min-w-0 flex-1 @max-[24rem]/dashboard:basis-full">
          <h3 className="line-clamp-2 text-[13px] font-medium leading-snug" title={heading}>
            {heading}
          </h3>
          {caption ? (
            <p
              className="line-clamp-2 text-[11.5px] leading-snug text-muted-foreground"
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
      <div
        className={cn(
          'flex shrink-0 items-center gap-0.5',
          dashboard &&
            'relative z-10 @max-[24rem]/dashboard:ms-auto [@media(hover:hover)]:@max-[24rem]/dashboard:h-0 [@media(hover:hover)]:@max-[24rem]/dashboard:items-start',
        )}
      >
        {actions}
      </div>
    </div>
  );
}
