import { useState } from 'react';
import { brand } from '@brand';
import { CircleAlertIcon } from 'lucide-react';
import { formatBytes, formatDuration } from '@/lib/format';
import { vocab } from '@/lib/brand-vocabulary';
import {
  clearPendingUpdateMarker,
  useUpdateFlowStore,
  type UpdateAction,
  type UpdateDownloadProgress,
  type UpdateStep,
} from '@/store/update-flow-store';
import { BrandStatusHeader } from './brand-status-header';
import { DialogFrame } from './primitives/dialog-frame';
import { StateView } from './primitives/state-view';
import { StepList, type StepListStep } from './primitives/step-list';
import { updatePageShown, useUpdatePaneHosted } from './update-page-host';

type PageStep = 'checking' | 'downloading' | 'installing' | 'restart' | 'verifying';

const STEP_OF: Partial<Record<UpdateStep, PageStep>> = {
  checking: 'checking',
  downloading: 'downloading',
  installing: 'installing',
  restarting: 'restart',
  reconnecting: 'restart',
  verifying: 'verifying',
};

const LABEL: Record<PageStep, string> = {
  checking: 'Checking for updates',
  downloading: 'Downloading',
  installing: 'Installing',
  restart: 'Restarting and reconnecting',
  verifying: 'Verifying the update',
};

const MEBIBYTE = 1024 * 1024;

function downloadLabel(progress?: UpdateDownloadProgress): string {
  if (!progress) return LABEL.downloading;
  const { downloadedBytes, totalBytes } = progress;
  if (totalBytes && totalBytes >= MEBIBYTE)
    return `Downloading, ${Math.round(downloadedBytes / MEBIBYTE)} of ${Math.round(totalBytes / MEBIBYTE)} MB`;
  return `Downloading, ${formatBytes(downloadedBytes)}${totalBytes ? ` of ${formatBytes(totalBytes)}` : ''}`;
}

function stepStart(times: Partial<Record<UpdateStep, number>>, step: PageStep): number | undefined {
  return step === 'restart' ? (times.restarting ?? times.reconnecting) : times[step];
}

/** The page's steps: an agent-only update downloads nothing of its own. */
function updateSteps({
  step,
  action,
  progress,
  lines,
  stepStartedAt,
}: {
  step: UpdateStep;
  action?: UpdateAction;
  progress?: UpdateDownloadProgress;
  lines: readonly string[];
  stepStartedAt: Partial<Record<UpdateStep, number>>;
}): StepListStep[] {
  const order: PageStep[] = (
    ['checking', 'downloading', 'installing', 'restart', 'verifying'] as const
  ).filter((id) => id !== 'downloading' || action !== 'agent');
  const current = order.indexOf(STEP_OF[step] ?? 'checking');
  return order.map((id, index) => {
    const state = index < current ? 'done' : index === current ? 'current' : 'todo';
    const started = stepStart(stepStartedAt, id);
    const next = order.slice(index + 1).find((later) => stepStart(stepStartedAt, later));
    const ended = next ? stepStart(stepStartedAt, next) : undefined;
    const percent =
      id === 'downloading' && progress?.totalBytes
        ? Math.min(1, progress.downloadedBytes / progress.totalBytes)
        : undefined;
    return {
      id,
      state,
      label: id === 'downloading' && state !== 'todo' ? downloadLabel(progress) : LABEL[id],
      meta:
        state === 'done' && started && ended
          ? formatDuration(ended - started, 'compact')
          : state === 'current' && percent !== undefined
            ? `${Math.round(percent * 100)}%`
            : undefined,
      progress: state === 'current' ? percent : undefined,
      log: state === 'current' && id === 'installing' ? lines.at(-1) : undefined,
    };
  });
}

/**
 * The update in the content pane: the steps while it runs, observed rather
 * than timed, and the error state if it did not finish. A process-replacing
 * restart resumes it from the persisted marker (`UpdateRestartRecovery`).
 */
export function UpdatePage() {
  const step = useUpdateFlowStore((state) => state.step);
  const action = useUpdateFlowStore((state) => state.action);
  const version = useUpdateFlowStore((state) => state.version);
  const progress = useUpdateFlowStore((state) => state.progress);
  const lines = useUpdateFlowStore((state) => state.lines);
  const stepStartedAt = useUpdateFlowStore((state) => state.stepStartedAt);
  const reason = useUpdateFlowStore((state) => state.reason);
  const reset = useUpdateFlowStore((state) => state.reset);
  const [details, setDetails] = useState(false);

  if (!updatePageShown(step)) return null;

  if (step === 'failed') {
    return (
      <div
        data-slot="update-page"
        className="clio-scrollbar grid size-full min-h-0 overflow-y-auto bg-background"
      >
        {/* The running page's column, so the error lands where its steps were. */}
        <section className="mx-auto flex w-full max-w-[420px] flex-col justify-center px-6 py-16">
          <BrandStatusHeader
            tone="error"
            status={version ? `Not updated to ${version}` : 'Not updated'}
          />
          <StateView
            kind="error"
            title="Update did not finish"
            className="min-h-0 py-0"
            action={{
              label: 'Dismiss',
              icon: null,
              onClick: () => {
                clearPendingUpdateMarker();
                reset();
              },
            }}
            link={{ label: 'Details', onClick: () => setDetails(true) }}
          />
        </section>
        <DialogFrame
          open={details}
          onOpenChange={setDetails}
          icon={<CircleAlertIcon />}
          title="Update details"
          description={version ? `Updating ${brand.wordmark} to ${version}` : undefined}
        >
          <p className="text-[13px] leading-5 break-words">
            {reason || `${vocab.agent} could not be reached after the update.`}
          </p>
          {lines.length ? (
            <pre className="clio-scrollbar mt-3 max-h-48 overflow-auto rounded-md bg-muted px-2.5 py-2 font-mono text-[11.5px] whitespace-pre-wrap break-words text-muted-foreground">
              {lines.slice(-40).join('\n')}
            </pre>
          ) : null}
        </DialogFrame>
      </div>
    );
  }

  // One name on the page: the header's wordmark ("Updating CLIO to 0.11.4" under "CLIO").
  const title = version ? `Updating ${brand.wordmark} to ${version}` : `Updating ${brand.wordmark}`;
  return (
    <div
      data-slot="update-page"
      className="clio-scrollbar grid size-full min-h-0 overflow-y-auto bg-background"
    >
      {/* The local startup page's column, so both step lists read alike. */}
      <section className="mx-auto flex w-full max-w-[420px] flex-col justify-center px-6 py-16">
        <BrandStatusHeader status={version ? `Updating to ${version}` : 'Updating'} />
        <StateView kind="loading" title={title} className="min-h-0 py-0 pb-3" />
        <StepList
          label={title}
          steps={updateSteps({ step, action, progress, lines, stepStartedAt })}
        />
      </section>
    </div>
  );
}

/**
 * The update page for routes without an app shell (the connection page,
 * Infrastructure): it covers the window, title bar included, without blur.
 * Where a shell is mounted the page sits in its content pane instead.
 */
export function UpdateRestartOverlay() {
  const shown = useUpdateFlowStore((state) => updatePageShown(state.step));
  const hosted = useUpdatePaneHosted();
  if (!shown || hosted) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-background">
      <UpdatePage />
    </div>
  );
}
