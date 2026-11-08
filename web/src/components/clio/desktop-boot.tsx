import { ShortcutKeys } from '@/components/clio/primitives/key-chip';
import { brand } from '@brand';
import { CheckIcon, SearchIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { Button } from '@/components/ui/button';
import { vocab } from '@/lib/brand-vocabulary';
import type { ManagedBackendStatus } from '@/tauri/managed-backend';

export type DesktopBootStage =
  | 'checking_existing'
  | 'starting_service'
  | 'installing_runtime'
  | 'opening_workspace';

const desktopBootCopy: Record<DesktopBootStage, { detail: string; label: string }> = {
  checking_existing: {
    label: 'Checking this device',
    detail: `Looking for a local ${vocab.agent} service`,
  },
  starting_service: {
    label: 'Starting local service',
    detail: 'Loading the bundled scientific workspace',
  },
  installing_runtime: {
    label: 'Installing local runtime',
    detail: `Preparing ${vocab.agent} for first use`,
  },
  opening_workspace: {
    label: 'Opening workspace',
    detail: 'Restoring your local workspace',
  },
};

export function managedBootStage(status?: ManagedBackendStatus): DesktopBootStage {
  if (status?.kind === 'needs_install') return 'installing_runtime';
  if (status?.kind === 'starting') return status.detail;
  return 'checking_existing';
}

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

export function DesktopBoot({
  logoSource,
  stage,
}: {
  logoSource: string | null;
  stage: DesktopBootStage;
}) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const copy = desktopBootCopy[stage];
  const activeStep = stage === 'checking_existing' ? 0 : stage === 'opening_workspace' ? 2 : 1;

  useEffect(() => {
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <main className="relative grid h-full min-h-0 overflow-hidden bg-background text-foreground">
      <div className="absolute right-4 top-4 z-10">
        <HomeSearchButton />
      </div>
      <div aria-hidden="true" className="clio-landing-background absolute inset-0 opacity-70" />
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 size-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/8 blur-3xl"
      />
      <section className="relative grid place-items-center px-6 py-16 text-center">
        <div className="grid justify-items-center">
          <div className="relative grid size-56 place-items-center sm:size-64">
            <div
              aria-hidden="true"
              className="absolute inset-0 rounded-full border border-primary/15 shadow-[0_0_80px_color-mix(in_oklch,var(--primary)_15%,transparent)]"
            />
            <div
              aria-hidden="true"
              className="absolute inset-7 rounded-full border border-primary/25"
            />
            <div className="relative grid size-36 place-items-center overflow-hidden rounded-[2.25rem] border border-primary/30 bg-card/45 p-4 shadow-2xl backdrop-blur-xl sm:size-40">
              {logoSource ? (
                <img
                  alt=""
                  className="size-full object-contain"
                  data-testid="desktop-boot-logo"
                  src={logoSource}
                />
              ) : (
                <span className="font-heading text-6xl font-semibold text-primary">
                  {brand.markGlyph}
                </span>
              )}
            </div>
          </div>
          <Shimmer
            as="h1"
            className="mt-7 font-heading text-2xl font-semibold tracking-[-0.035em]"
            duration={1.7}
          >
            {`Starting ${brand.name}`}
          </Shimmer>
          <p className="mt-2 text-sm text-muted-foreground">
            Your local scientific workspace is getting ready.
          </p>
        </div>
      </section>

      <aside
        aria-live="polite"
        className="absolute bottom-6 right-6 w-[min(22rem,calc(100%-3rem))] rounded-2xl border border-border/80 bg-card/75 p-4 text-left shadow-xl backdrop-blur-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
              Local startup
            </p>
            <p className="mt-1 truncate text-sm font-medium">{copy.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{copy.detail}</p>
          </div>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
            {elapsedSeconds}s
          </span>
        </div>
        <ol className="mt-4 grid grid-cols-3 gap-2" aria-label="Startup progress">
          {['Check', stage === 'installing_runtime' ? 'Install' : 'Start', 'Open'].map(
            (label, index) => (
              <li className="flex min-w-0 items-center gap-1.5 text-[11px]" key={label}>
                <span
                  className="grid size-4 shrink-0 place-items-center rounded-full border border-border bg-background text-muted-foreground data-[active=true]:border-primary data-[active=true]:text-primary data-[done=true]:border-success/50 data-[done=true]:bg-success/10 data-[done=true]:text-success"
                  data-active={index === activeStep}
                  data-done={index < activeStep}
                >
                  {index < activeStep ? (
                    <CheckIcon aria-hidden="true" className="size-2.5" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="truncate text-muted-foreground">{label}</span>
              </li>
            ),
          )}
        </ol>
      </aside>
    </main>
  );
}
