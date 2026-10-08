import type { OperationReuse } from '@clio/core/v3';
import { ClockIcon } from 'lucide-react';
import { vocab } from '@/lib/brand-vocabulary';
import { formatBytes } from '@/lib/format';
import { cn } from '@/lib/utils';

/** What the service measured or reported, never a guess. Every field is optional. */
export type InstallEstimate = {
  /** What is being installed, in the person's words ("vLLM", "org/model"). */
  thing: string;
  /** Bytes the install will download, when the catalog or the download reported them. */
  downloadBytes?: number | null;
  /** How long the last full install of this thing took, when it was measured. */
  lastSeconds?: number | null;
  /** Verified items the reuse preflight is skipping for this operation. */
  reused?: readonly OperationReuse[];
};

function minutes(seconds: number): string {
  return seconds < 60 ? 'under a minute' : `~${Math.round(seconds / 60)} min`;
}

/**
 * The expectation shown as a long install starts: "already available" when the
 * reuse preflight verified what is needed, otherwise "several minutes" plus any
 * measured size or previous duration, and that leaving the page is safe.
 */
export function installExpectation({
  thing,
  downloadBytes,
  lastSeconds,
  reused = [],
}: InstallEstimate): string {
  if (reused.length) {
    const things = [...new Set(reused.map((row) => row.thing))].join(', ');
    return `Already available — reusing ${things}; this should take under a minute.`;
  }
  const known = [
    typeof downloadBytes === 'number' && downloadBytes > 0
      ? `About ${formatBytes(downloadBytes)} to download.`
      : '',
    typeof lastSeconds === 'number' && lastSeconds > 0
      ? `Last install took ${minutes(lastSeconds)}.`
      : '',
  ].filter(Boolean);
  return [
    `This can take several minutes — ${vocab.agent} downloads and prepares ${thing}.`,
    ...known,
    'You can leave this page; progress continues.',
  ].join(' ');
}

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
