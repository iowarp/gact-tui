import { useEffect, useState } from 'react';
import { vocab } from '@/lib/brand-vocabulary';
import { STARTUP_STEP_OF, type DesktopBootStage } from '@/lib/desktop-boot-stage';
import {
  describeInstallProgress,
  type RuntimeInstallProgress,
} from '@/lib/runtime-install-progress';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { BrandIcon } from './brand-icon';
import { LocalStartupSteps } from './local-startup-steps';
import { useStartupLog } from './use-startup-log';

const STAGE_DETAIL: Record<DesktopBootStage, string> = {
  checking_existing: `Looking for a local ${vocab.agent} service`,
  installing_runtime: `Preparing ${vocab.agent} for first use`,
  starting_service: 'Loading the bundled scientific workspace',
  opening_workspace: 'Restoring your local workspace',
};

/**
 * The local startup page: one heading row saying what is starting, the steps as status
 * lines, and the tool output in Startup details on request.
 */
export function DesktopBoot({
  detail,
  install,
  stage,
}: {
  /** What the service says it is still loading, in place of the stage's own detail. */
  detail?: string;
  /** A first-use install's progress (download MB, unpacking, packages), under its step. */
  install?: RuntimeInstallProgress;
  stage: DesktopBootStage;
}) {
  const log = useStartupLog(inTauri(), true);
  const installing = stage === 'installing_runtime' && install !== undefined;
  const now = useSecondClock(installing);
  const progress = installing ? describeInstallProgress(install, now) : undefined;
  return (
    <main className="relative grid h-full min-h-0 overflow-y-auto bg-background text-foreground">
      <section className="mx-auto flex w-full max-w-[420px] flex-col justify-center px-6 py-16">
        <h1 className="m-0 mb-2.5 flex items-center gap-2.5 font-heading text-[1rem] font-semibold">
          <BrandIcon className="size-[22px] shrink-0 text-primary" />
          {`Starting local ${vocab.agent}`}
        </h1>
        <LocalStartupSteps
          current={STARTUP_STEP_OF[stage]}
          detail={detail ?? STAGE_DETAIL[stage]}
          log={log}
          progress={progress}
          running
        />
      </section>
    </main>
  );
}

/** The time, re-read every second while `running`. */
function useSecondClock(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  return now;
}
