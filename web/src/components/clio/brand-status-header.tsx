import { brand } from '@brand';
import { CircleAlertIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BrandIcon } from './brand-icon';
import { RingSpinner } from './primitives/ring-spinner';

/**
 * The pane header of a page that stands in for the app while it starts or
 * updates: the brand, and under it what is happening, in the warning tone
 * with a spinner -- or, once it has stopped, in the error tone with an
 * alert icon. It sits at the top of the page's centred column, pulled
 * slightly left of it where the column has room for that.
 */
export function BrandStatusHeader({
  status,
  tone = 'busy',
}: {
  status: string;
  tone?: 'busy' | 'error';
}) {
  return (
    <div
      data-slot="brand-status-header"
      data-tone={tone}
      className="mb-[18px] flex sm:-ml-[10%] h-[46px] min-w-0 items-center gap-2.5 px-2.5 whitespace-nowrap"
    >
      <BrandIcon className="size-[18px] shrink-0 text-accent-foreground" />
      <span className="flex min-w-0 flex-col gap-px">
        <span className="font-heading text-[14px] font-semibold">{brand.wordmark}</span>
        <span
          className={cn(
            'flex min-w-0 items-center gap-[5px] text-label',
            tone === 'error' ? 'text-destructive' : 'text-warning-foreground',
          )}
        >
          {tone === 'error' ? (
            <CircleAlertIcon aria-hidden="true" className="size-[10px] shrink-0" />
          ) : (
            <RingSpinner className="size-[9px]" />
          )}
          <span className="truncate">{status}</span>
        </span>
      </span>
    </div>
  );
}
