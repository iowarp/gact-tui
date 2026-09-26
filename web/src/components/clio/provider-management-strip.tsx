import type { LanguageModelPreset } from '@clio/core/v3';
import { LoaderCircleIcon } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { FieldSeparator } from '@/components/ui/field';
import { translateKnownProviderErrorReason } from '@/lib/provider-availability';
import { cn } from '@/lib/utils';
import {
  readyTransportsPreset,
  transportHasModels,
  transportScopedPreset,
  type ProviderGroup,
} from './model-picker-model';
import { ProviderActionPanel, type ProviderActions, type ProviderActionSize } from './provider-action-panel';

interface ProviderManagementStripProps {
  group: ProviderGroup;
  preset: LanguageModelPreset | undefined;
  actions: ProviderActions;
  size?: ProviderActionSize;
  /** Rendered at the end of the state line (the picker's settings link). */
  trailing?: ReactNode;
  className?: string;
}

/**
 * One provider's state line and state-driven actions -- the model picker's
 * per-provider action strip AND Settings > Providers' action block, from this
 * one component: the running stage (yellow spinner + "Verifying…",
 * "Discovering models…", "Saving key…") or the provider's reason, then
 * exactly the actions its state calls for.
 *
 * A multi-transport provider (Codex: local SDK "or" Direct) shows both
 * halves: the ready half's provider-level actions once (Verify provider /
 * Refresh models, plus Sign out only when a READY transport's `auth.logout`
 * says CLIO can), then each transport that still needs something, "or"
 * separated, with its own action -- or its reason, for a transport CLIO
 * cannot sign in (the SDK is the user's own Codex login).
 */
export function ProviderManagementStrip({
  group,
  preset,
  actions,
  size = 'sm',
  trailing,
  className,
}: ProviderManagementStripProps) {
  const stage = actions.stage;
  // Red only for a real failure; "needs a key / sign-in / install" is neutral.
  const failed = group.health === 'degraded' || group.health === 'unavailable';
  const transports = group.transports ?? [];
  const multiTransport = transports.length > 1;
  // Transports the model list already shows with their own heading need no
  // action here; the rest get their section below.
  const actionTransports = multiTransport
    ? transports.filter((transport) => !transportHasModels(group, transport.id))
    : [];
  const readyPreset =
    preset && multiTransport ? readyTransportsPreset(preset, transports) : undefined;
  const shownDetail = stage ? undefined : group.detail;
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <div
      className={cn('flex min-w-0 shrink-0 flex-col gap-2', className)}
      data-slot="provider-action-strip"
    >
      {stage || group.detail || trailing ? (
        <div className="flex min-w-0 items-start gap-2">
          {/* While an action runs its stage replaces the last verdict (a stale
              "missing key" must not sit beside "Saving key…"); once it settles
              the provider's fresh detail -- or nothing, when ready -- comes back. */}
          {stage ? (
            <p
              className={cn('flex flex-1 items-center gap-1.5 text-muted-foreground', textSize)}
              data-slot="provider-action-stage"
              role="status"
            >
              <LoaderCircleIcon aria-hidden="true" className="size-3.5 animate-spin text-warning" />
              {stage}
            </p>
          ) : group.detail ? (
            <p
              className={cn('flex-1', textSize, failed ? 'text-destructive' : 'text-muted-foreground')}
              role={failed ? 'alert' : 'status'}
            >
              {group.detail}
            </p>
          ) : (
            <span className="flex-1" />
          )}
          {trailing}
        </div>
      ) : null}
      {readyPreset ? (
        <ProviderActionPanel
          actions={actions}
          preset={readyPreset}
          shownDetail={shownDetail}
          size={size}
        />
      ) : null}
      {preset && multiTransport ? (
        actionTransports.map((transport, index) => (
          <Fragment key={transport.id}>
            {index > 0 || readyPreset ? (
              <FieldSeparator
                className={cn(
                  'my-0 text-xs',
                  // The label's backdrop matches its host: the picker's popover or the page.
                  size === 'sm'
                    ? '**:data-[slot=field-separator-content]:bg-popover'
                    : '**:data-[slot=field-separator-content]:bg-background',
                )}
              >
                or
              </FieldSeparator>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold text-muted-foreground">{transport.label}</p>
              {transport.auth ? (
                <ProviderActionPanel
                  actions={actions}
                  preset={transportScopedPreset(preset, transport)}
                  shownDetail={shownDetail}
                  size={size}
                />
              ) : transport.reason ? (
                <p className={cn('text-muted-foreground', textSize)} title={transport.reason}>
                  {translateKnownProviderErrorReason(transport.reason, group.name)}
                </p>
              ) : null}
            </div>
          </Fragment>
        ))
      ) : preset ? (
        <ProviderActionPanel actions={actions} preset={preset} shownDetail={shownDetail} size={size} />
      ) : null}
    </div>
  );
}
