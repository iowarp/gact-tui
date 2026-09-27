import { LoaderCircleIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { vocab } from '@/lib/brand-vocabulary';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { restartClio } from '@/tauri/managed-backend';
import { InfoTip } from './info-tip';
import type { ProviderGroup } from './model-picker-model';
import type { ProviderComponentUpdateState } from './provider-component-update';

/** "Installed Codex 0.157.1" / "Bundled Claude Code 2.1.276". */
function providerClientLabel(group: ProviderGroup): string | undefined {
  const client = group.client;
  if (!client?.source) return undefined;
  const source = client.source === 'installed' ? 'Installed' : 'Bundled';
  return [source, group.name, client.version].filter(Boolean).join(' ');
}

/**
 * The provider's SDK version fact and, when a newer release is installable,
 * "Update available: <version>" with a one-click Update. A running update
 * shows its stage here (and on the provider heartbeat); a finished one that
 * needs a restart offers it, and a failed one says what it kept.
 */
export function ProviderComponentStatus({
  group,
  state,
}: {
  group: ProviderGroup;
  state: ProviderComponentUpdateState;
}) {
  const [restarting, setRestarting] = useState(false);
  const label = providerClientLabel(group);
  const { components, stage, outcome } = state;
  if (!label && !components) return null;
  const details = components?.components
    .map((item) => `${item.distribution} ${item.installed_version} → ${item.latest_version}`)
    .join('\n');
  const failure = outcome?.stage === 'failed' ? outcome : undefined;
  const kept = failure ? Object.values(failure.from_versions)[0] : undefined;
  const restart = outcome?.stage === 'done' && outcome.restart_required && !stage;

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
      className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 border-t px-3 py-1.5 text-xs text-muted-foreground"
      data-slot="provider-component-status"
    >
      {label ? (
        <span
          className="truncate"
          data-slot="provider-client-fact"
          title={group.client?.path || undefined}
        >
          {label}
        </span>
      ) : null}
      {stage ? (
        <span
          className="flex items-center gap-1"
          data-slot="provider-component-stage"
          role="status"
        >
          <LoaderCircleIcon aria-hidden="true" className="size-3 animate-spin" />
          {stage}
        </span>
      ) : components?.update_available ? (
        <>
          <Badge data-slot="provider-update-available" title={details} variant="outline">
            Update available: {components.target_version}
          </Badge>
          <Button onClick={state.update} size="xs" type="button" variant="outline">
            Update
          </Button>
        </>
      ) : null}
      {restart ? (
        inTauri() ? (
          <Button
            disabled={restarting}
            onClick={() => void restartNow()}
            size="xs"
            type="button"
            variant="outline"
          >
            Restart {vocab.agent}
          </Button>
        ) : (
          <span data-slot="provider-update-restart">Restart {vocab.agent} to finish</span>
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
