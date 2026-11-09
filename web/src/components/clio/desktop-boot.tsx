import { ShortcutKeys } from '@/components/clio/primitives/key-chip';
import { brand } from '@brand';
import { ChevronRightIcon, SearchIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BrandIcon } from '@/components/clio/brand-icon';
import { ConnectStatusLine } from '@/components/clio/connect-frame';
import { Button } from '@/components/ui/button';
import { vocab } from '@/lib/brand-vocabulary';
import type { DesktopBootStage } from '@/lib/desktop-boot-stage';

const STARTUP_STEPS = [
  'Checking the local service',
  'Preparing the local runtime and packages',
  'Starting the local service',
  'Opening the workspace',
] as const;

const STAGE_STEP: Record<DesktopBootStage, number> = {
  checking_existing: 0,
  installing_runtime: 1,
  starting_service: 2,
  opening_workspace: 3,
};

const STAGE_DETAIL: Record<DesktopBootStage, string> = {
  checking_existing: `Looking for a local ${vocab.agent} service`,
  installing_runtime: `Preparing ${vocab.agent} for first use`,
  starting_service: 'Loading the bundled scientific workspace',
  opening_workspace: 'Restoring your local workspace',
};

export function HomeSearchButton() {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label="Search everywhere"
      onClick={() => window.dispatchEvent(new Event('clio:open-command-menu'))}
    >
      <SearchIcon aria-hidden="true" /> Search{' '}
      <ShortcutKeys id="search" className="ml-2 text-[10px]" />
    </Button>
  );
}

/** The local startup splash: the brand, one status line per step, and the details on request. */
export function DesktopBoot({
  detail,
  stage,
}: {
  /** What the service says it is still loading, in place of the stage's own detail. */
  detail?: string;
  stage: DesktopBootStage;
}) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const current = STAGE_STEP[stage];

  useEffect(() => {
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <main className="relative grid h-full min-h-0 overflow-y-auto bg-background text-foreground">
      <div className="absolute top-3 right-3">
        <HomeSearchButton />
      </div>
      <section className="mx-auto flex w-full max-w-[420px] flex-col justify-center gap-1 px-6 py-16">
        <h1 className="mb-2.5 flex items-center gap-2.5 font-heading text-[16px] font-semibold">
          <BrandIcon className="size-[22px] shrink-0 text-primary" />
          {`Starting ${brand.name}`}
        </h1>
        <ol aria-label="Startup progress" aria-live="polite" className="m-0 list-none p-0">
          {STARTUP_STEPS.map((label, index) => (
            <li key={label}>
              <ConnectStatusLine
                meta={index === current ? `${elapsedSeconds}s` : undefined}
                tone={index < current ? 'done' : index === current ? 'working' : 'pending'}
              >
                {label}
              </ConnectStatusLine>
            </li>
          ))}
        </ol>
        <details className="group mt-1.5 -mx-2 text-[12.5px] text-muted-foreground">
          <summary className="flex min-h-[30px] cursor-pointer list-none items-center gap-2 rounded-[6px] px-2 outline-none hover:bg-hover focus-visible:ring-1 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <ChevronRightIcon
              aria-hidden="true"
              className="size-3.5 transition-transform group-open:rotate-90 motion-reduce:transition-none"
            />
            Startup details
          </summary>
          <p className="m-0 px-2 pt-1 pl-[30px] text-[12px]">{detail ?? STAGE_DETAIL[stage]}</p>
        </details>
      </section>
    </main>
  );
}
