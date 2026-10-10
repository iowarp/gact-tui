import { ClockIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { installExpectation, type InstallEstimate } from './install-expectation-model';

/** A quiet, non-blocking line next to the operation's progress (not a live region). */
export function InstallExpectation({
  className,
  ...estimate
}: InstallEstimate & { className?: string }) {
  return (
    <p
      className={cn('flex items-start gap-2 text-xs text-muted-foreground', className)}
      data-slot="install-expectation"
    >
      <ClockIcon aria-hidden="true" className="mt-px size-3.5 shrink-0" />
      <span>{installExpectation(estimate)}</span>
    </p>
  );
}
