import { AlertTriangleIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { formatBytes } from '@/lib/format';
import { vocab } from '@/lib/brand-vocabulary';
import { useUpdateFlowStore, type UpdateStep } from '@/store/update-flow-store';

type OverlayStep = Exclude<UpdateStep, 'idle' | 'done' | 'failed'>;

const STEP_COPY: Record<OverlayStep, { label: string; detail: string }> = {
  checking: {
    label: 'Checking for updates',
    detail: `Comparing the installed and published ${vocab.agent} versions.`,
  },
  downloading: {
    label: 'Downloading update',
    detail: `Fetching the signed ${vocab.product} update.`,
  },
  installing: {
    label: `Installing ${vocab.agent}`,
    detail: 'Applying the update on this computer.',
  },
  restarting: {
    label: `Restarting ${vocab.agent}`,
    detail: 'The update finished. Restarting to apply it.',
  },
  reconnecting: {
    label: 'Reconnecting',
    detail: `Waiting for ${vocab.agent} to come back online.`,
  },
};

/**
 * Full-screen blocking status shown while an update is actively running, and
 * again after a process-replacing restart until the managed backend answers
 * (`UpdateRestartRecovery` drives that second half from the persisted
 * marker — see `store/update-flow-store.ts`). Replaces the silent
 * disconnect + transport-error cards a `git log`-worthy update used to leave
 * behind: every phase here is a real, observed state, never a guessed delay.
 *
 * Mount once near the app root. Renders nothing for `idle`/`done` (a
 * completed update gets a brief toast instead — see `UpdateRestartRecovery`).
 */
export function UpdateRestartOverlay() {
  const step = useUpdateFlowStore((state) => state.step);
  const progress = useUpdateFlowStore((state) => state.progress);
  const lines = useUpdateFlowStore((state) => state.lines);
  const reason = useUpdateFlowStore((state) => state.reason);
  const reset = useUpdateFlowStore((state) => state.reset);

  if (step === 'idle' || step === 'done') return null;

  if (step === 'failed') {
    return (
      <div
        aria-labelledby="update-restart-failed-title"
        className="fixed inset-0 z-[100] grid place-items-center bg-background/95 p-6 backdrop-blur-sm"
        role="alertdialog"
      >
        <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl">
          <div className="flex items-start gap-3">
            <AlertTriangleIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <h2 className="font-heading font-semibold" id="update-restart-failed-title">
                Update did not finish
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {reason || `${vocab.agent} could not be reached after the update.`}
              </p>
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <Button onClick={reset} type="button" variant="outline">
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const copy = STEP_COPY[step];
  const percent =
    progress?.totalBytes && progress.totalBytes > 0
      ? Math.min(100, Math.round((progress.downloadedBytes / progress.totalBytes) * 100))
      : undefined;

  return (
    <div
      aria-labelledby="update-restart-title"
      aria-live="polite"
      className="fixed inset-0 z-[100] grid place-items-center bg-background/95 p-6 backdrop-blur-sm"
      role="status"
    >
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-2xl">
        <Spinner className="mx-auto size-6 text-primary" />
        <h2 className="mt-4 font-heading text-lg font-semibold" id="update-restart-title">
          {copy.label}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{copy.detail}</p>
        {percent !== undefined && progress ? (
          <div className="mt-4">
            <Progress value={percent} />
            <p className="mt-1 text-xs text-muted-foreground">
              {percent}% · {formatBytes(progress.downloadedBytes)}
              {progress.totalBytes ? ` of ${formatBytes(progress.totalBytes)}` : ''}
            </p>
          </div>
        ) : step === 'installing' || step === 'reconnecting' ? (
          <Progress className="mt-4 motion-safe:animate-pulse" value={70} />
        ) : null}
        {lines.length > 0 ? (
          <pre className="mt-4 max-h-28 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-2 text-left font-mono text-[11px] text-muted-foreground">
            {lines.slice(-6).join('\n')}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
