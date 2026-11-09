import { brand } from '@brand';
import { Spinner } from '@/components/ui/spinner';
import { BrandIcon } from './brand-icon';

/**
 * The pane header of a page that stands in for the app while it starts or
 * updates: the brand, and under it what is happening, in the warning tone
 * with a spinner. It sits at the top of the page's centred column, pulled
 * slightly left of it where the column has room for that.
 */
export function BrandStatusHeader({ status }: { status: string }) {
  return (
    <div
      data-slot="brand-status-header"
      className="mb-[18px] flex sm:-ml-[10%] h-[46px] min-w-0 items-center gap-2.5 px-2.5 whitespace-nowrap"
    >
      <BrandIcon className="size-[18px] shrink-0 text-accent-foreground" />
      <span className="flex min-w-0 flex-col gap-px">
        <span className="font-heading text-[14px] font-semibold">{brand.wordmark}</span>
        <span className="flex min-w-0 items-center gap-[5px] text-[11.5px] text-warning-foreground">
          <Spinner aria-hidden="true" className="size-[9px] shrink-0 motion-reduce:animate-none" />
          <span className="truncate">{status}</span>
        </span>
      </span>
    </div>
  );
}
