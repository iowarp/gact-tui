import { CircleArrowUpIcon, LoaderCircleIcon } from 'lucide-react';
import { RefreshIcon, RetryIcon } from '@/lib/icon-vocabulary';
import { type ComponentProps, useState } from 'react';
import { toast } from 'sonner';
import { vocab } from '@/lib/brand-vocabulary';
import { cn } from '@/lib/utils';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { restartClio } from '@/tauri/managed-backend';
import { InfoTip } from './info-tip';
import type { ProviderGroup } from './model-picker-model';
import type { ProviderComponentUpdateState } from './provider-component-update';

/** "Installed Claude Code 2.1.276" / "Bundled Claude Code 2.1.276". */
function providerClientLabel(group: ProviderGroup): string | undefined {
  const client = group.client;
  if (!client?.source) return undefined;
  const source = client.source === 'installed' ? 'Installed' : 'Bundled';
  return [source, group.name, client.version].filter(Boolean).join(' ');
}

/** A text action in the picker's 11px status row (the spec's `.pft .lk`). */
function StatusLink({ className, ...props }: ComponentProps<'button'>) {
  return (
    <button
      className={cn(
        'inline-flex shrink-0 items-center gap-[5px] rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-[13px] [&_svg]:shrink-0',
        className,
      )}
      type="button"
      {...props}
    />
  );
}

/**
 * The provider's SDK version fact and, when a newer release is installable,
 * a one-click "Update to <version>". A running update
 * shows its stage here (and on the provider heartbeat); a finished one that
 * needs a restart offers it, and a failed one says what it kept.
 */
export function ProviderComponentStatus({
  group,
  state,
  busy = false,
}: {
  group: ProviderGroup;
  state: ProviderComponentUpdateState;
  busy?: boolean;
}) {
  const [restarting, setRestarting] = useState(false);
  const label = providerClientLabel(group);
  const { components, stage, outcome } = state;
  if (!label && !components && !state.checkError) return null;
  // Compare the installed component with its update target. Claude Code's
  // separate CLI version remains in the details alongside its source and path.
  const version = components?.components[0]?.installed_version || group.client?.version;
  const details = components?.components
    .map((item) => `${item.distribution} ${item.installed_version} → ${item.latest_version}`)
    .join('\n');
  const clientDetails = [label, group.client?.path, details].filter(Boolean).join('\n');
  const failure = outcome?.stage === 'failed' ? outcome : undefined;
  const kept = failure ? Object.values(failure.from_versions)[0] : undefined;
  const restart = outcome?.stage === 'done' && outcome.restart_required && !stage;
  const noCompatibleRelease = components?.error?.code === 'component_no_installable_release';

  const restartNow = async () => {
    setRestarting(true);
    try {
      await restartClio();
    } catch (error) {
      toast.error(`Could not restart ${vocab.agent}`, {
        description: error instanceof Error ? error.message : String(error),
      });
      setRestarting(false);
    }
  };

  return (
    <div
      className="flex h-8 min-w-0 shrink-0 flex-nowrap items-center gap-3 overflow-hidden border-t px-3 text-caption whitespace-nowrap text-faint"
      data-slot="provider-component-status"
    >
      {version || label ? (
        <span
          className="min-w-0 truncate"
          data-slot="provider-client-fact"
          title={clientDetails || details}
        >
          {version ? `Version ${version}` : label}
        </span>
      ) : null}
      <StatusLink disabled={busy || Boolean(stage) || state.checking} onClick={state.check}>
        {state.checking ? (
          <LoaderCircleIcon aria-hidden="true" className="motion-safe:animate-spin" />
        ) : (
          <RefreshIcon aria-hidden="true" />
        )}
        {state.checking ? 'Checking updates…' : 'Check updates'}
      </StatusLink>
      {stage ? (
        <span
          className="inline-flex shrink-0 items-center gap-[5px] text-muted-foreground"
          data-slot="provider-component-stage"
          role="status"
        >
          <LoaderCircleIcon aria-hidden="true" className="size-[13px] motion-safe:animate-spin" />
          {stage}
        </span>
      ) : components?.update_available ? (
        <StatusLink
          className="text-accent-foreground hover:text-accent-foreground hover:underline"
          data-slot="provider-update-available"
          disabled={busy}
          onClick={state.update}
          title={details}
        >
          <CircleArrowUpIcon aria-hidden="true" />
          Update to {components.target_version}
        </StatusLink>
      ) : null}
      {noCompatibleRelease ? (
        <span
          className="min-w-0 truncate"
          role="status"
          title="No compatible client update is available yet."
        >
          No compatible client update is available yet.
        </span>
      ) : state.checkError || components?.error?.message ? (
        // A failed check says so in words; the service's reason is its hover detail.
        <span
          className="min-w-0 truncate text-destructive"
          role="alert"
          title={state.checkError || components?.error?.message}
        >
          Can't check updates
        </span>
      ) : null}
      {restart ? (
        inTauri() ? (
          <StatusLink disabled={restarting} onClick={() => void restartNow()}>
            <RetryIcon aria-hidden="true" />
            Restart {vocab.agent}
          </StatusLink>
        ) : (
          <span className="text-muted-foreground" data-slot="provider-update-restart">
            Restart {vocab.agent} to finish
          </span>
        )
      ) : null}
      {failure && !stage ? (
        <span className="flex items-center gap-1 text-destructive" role="alert">
          {failure.rolled_back && kept ? `Update failed. Kept ${kept}.` : 'Update failed.'}
          {failure.error?.message ? (
            <InfoTip label="Why the update failed">{failure.error.message}</InfoTip>
          ) : null}
        </span>
      ) : state.startError && !stage ? (
        <span className="text-destructive" role="alert">
          {state.startError}
        </span>
      ) : null}
    </div>
  );
}
