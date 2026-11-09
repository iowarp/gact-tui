import { brand } from '@brand';
import { Spinner } from '@/components/ui/spinner';
import { vocab } from '@/lib/brand-vocabulary';
import { STARTUP_STEP_OF, type DesktopBootStage } from '@/lib/desktop-boot-stage';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { BrandIcon } from './brand-icon';
import { LocalStartupSteps } from './local-startup-steps';
import { useStartupLog } from './use-startup-log';
import { StateView } from './primitives/state-view';

const STAGE_DETAIL: Record<DesktopBootStage, string> = {
  checking_existing: `Looking for a local ${vocab.agent} service`,
  installing_runtime: `Preparing ${vocab.agent} for first use`,
  starting_service: 'Loading the bundled scientific workspace',
  opening_workspace: 'Restoring your local workspace',
};

/** The local startup page: what is starting, the steps with their times, the details on request. */
export function DesktopBoot({
  detail,
  stage,
}: {
  /** What the service says it is still loading, in place of the stage's own detail. */
  detail?: string;
  stage: DesktopBootStage;
}) {
  const log = useStartupLog(inTauri(), true);
  return (
    <main className="relative grid h-full min-h-0 overflow-y-auto bg-background text-foreground">
      <section className="mx-auto flex w-full max-w-[420px] flex-col justify-center px-6 py-16">
        <div className="mb-[18px] -ml-[10%] flex h-[46px] min-w-0 items-center gap-2.5 px-2.5 whitespace-nowrap">
          <BrandIcon className="size-[18px] shrink-0 text-accent-foreground" />
          <span className="flex min-w-0 flex-col gap-px">
            <span className="font-heading text-[14px] font-semibold">{brand.wordmark}</span>
            <span className="flex min-w-0 items-center gap-[5px] text-[11.5px] text-warning-foreground">
              <Spinner
                aria-hidden="true"
                className="size-[9px] shrink-0 motion-reduce:animate-none"
              />
              <span className="truncate">{`${vocab.agent} local, starting`}</span>
            </span>
          </span>
        </div>
        <StateView
          kind="loading"
          className="min-h-0 py-0 pb-3"
          title={
            <h1 className="m-0 inline text-[length:inherit] font-[inherit]">{`Starting ${vocab.agent} local`}</h1>
          }
        />
        <LocalStartupSteps
          current={STARTUP_STEP_OF[stage]}
          detail={detail ?? STAGE_DETAIL[stage]}
          log={log}
          running
        />
      </section>
    </main>
  );
}
