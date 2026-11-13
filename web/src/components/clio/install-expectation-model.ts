import type { OperationReuse } from '@clio/core/v3';
import { vocab } from '@/lib/brand-vocabulary';
import { formatBytes } from '@/lib/format';
import { t, ph } from '@lingui/core/macro';

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
  return seconds < 60 ? t`under a minute` : t`~${ph({ minutes: Math.round(seconds / 60) })} min`;
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
    return t`Reusing ${things}. This should take under a minute.`;
  }
  const known = [
    typeof downloadBytes === 'number' && downloadBytes > 0
      ? t`About ${ph({ size: formatBytes(downloadBytes) })} to download.`
      : '',
    typeof lastSeconds === 'number' && lastSeconds > 0
      ? t`Last install took ${ph({ duration: minutes(lastSeconds) })}.`
      : '',
  ].filter(Boolean);
  return [
    t`${ph({ agent: vocab.agent })} downloads and prepares ${thing}. This can take several minutes.`,
    ...known,
    t`You can leave this page; progress continues.`,
  ].join(' ');
}
