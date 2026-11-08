import { memo } from 'react';
import { splitForMiddleTruncation } from '@/lib/middle-truncate';
import { cn } from '@/lib/utils';

/**
 * One line that ends in an ellipsis instead of wrapping; the full text is the
 * hover name. Nothing in the interface wraps to a second line by accident.
 */
export const TruncatedText = memo(function TruncatedText({
  children,
  className,
  title,
}: {
  children: string;
  className?: string;
  /** Hover text when it differs from the visible text. */
  title?: string;
}) {
  return (
    <span
      data-slot="truncated-text"
      title={title ?? children}
      className={cn('block min-w-0 truncate', className)}
    >
      {children}
    </span>
  );
});

/**
 * A path or long name that drops characters from the middle, keeping the
 * start and the file name: `data/ndp/…/soil_sites.csv`.
 */
export const MiddleTruncate = memo(function MiddleTruncate({
  children,
  className,
  tailLength,
}: {
  children: string;
  className?: string;
  tailLength?: number;
}) {
  const [head, tail] = splitForMiddleTruncation(children, tailLength);
  return (
    <span
      data-slot="middle-truncate"
      title={children}
      aria-label={children}
      className={cn('flex min-w-0 whitespace-nowrap', className)}
    >
      <span aria-hidden="true" className="min-w-0 truncate">
        {head}
      </span>
      {tail ? (
        <span aria-hidden="true" className="shrink-0">
          {tail}
        </span>
      ) : null}
    </span>
  );
});
