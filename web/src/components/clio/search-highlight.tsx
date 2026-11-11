import { Fragment } from 'react';
import { searchMatchRanges } from '@/lib/search-matches';

/** The typed match reads as emphasised text (weight and the accent ink), never a filled box. */
export function SearchHighlight({
  text,
  query,
  ranges: suppliedRanges,
  partial = false,
}: {
  text: string;
  query: string;
  ranges?: ReadonlyArray<[number, number]>;
  partial?: boolean;
}) {
  const ranges = suppliedRanges ?? searchMatchRanges(text, query, partial);
  return (
    <>
      {ranges.map(([start, end], index) => {
        const before = text.slice(ranges[index - 1]?.[1] ?? 0, start);
        return (
          <Fragment key={start}>
            {before}
            <mark className="bg-transparent font-semibold text-accent-foreground">
              {text.slice(start, end)}
            </mark>
          </Fragment>
        );
      })}
      {text.slice(ranges.at(-1)?.[1] ?? 0)}
    </>
  );
}
