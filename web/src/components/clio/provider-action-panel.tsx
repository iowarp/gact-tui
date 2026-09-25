import type { LanguageModelPreset } from '@clio/core/v3';
import {
  CircleAlertIcon,
  DownloadIcon,
  KeyRoundIcon,
  LogOutIcon,
  RadioTowerIcon,
  RefreshCwIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Input } from '@/components/ui/input';
import { providerPrimaryAction } from '@/lib/provider-availability';
import { providerDisplayName } from '@/lib/provider-presentation';
import { cn } from '@/lib/utils';
import { ProviderAuthPanel } from './provider-auth-panel';
import { HandshakeResult, RefreshResult } from './settings-models-results';
import type { useProviderSettingsActions } from './settings-models-actions';
import { ClioStatus } from './status';

export type ProviderActions = ReturnType<typeof useProviderSettingsActions>;

interface ProviderActionPanelProps {
  preset: LanguageModelPreset | undefined;
  actions: ProviderActions;
  /**
   * Icon-first controls sized for the model picker's submenu. The Settings
   * page's fuller button-and-paragraph layout otherwise -- same actions, same
   * hook, same result data; only the presentation differs.
   */
  compact?: boolean;
}

/**
 * The ONE implementation of "what does this provider need before its models
 * are usable" -- sign-in (OAuth/subscription), runtime install, an API key,
 * or just a check/refresh/sign-out control once it is ready. Used by both
 * the model picker's provider submenu and Settings > Providers so a fix or a
 * new provider kind lands in exactly one place.
 *
 * Shows EXACTLY the action set the provider's own state calls for -- never
 * every action at once (a signed-out provider does not also offer to be
 * checked or signed out of; an installed-but-signed-out provider shows only
 * Sign in, not Install too). No action ever starts itself: every mutation
 * here fires only from an explicit click in this render, never a mount
 * effect -- a submenu opening must never open a browser or a device-code
 * prompt on its own.
 */
export function ProviderActionPanel({ preset, actions, compact = false }: ProviderActionPanelProps) {
  const action = providerPrimaryAction(preset);
  const providerLabel = providerDisplayName(preset);

  if (!preset) return null;

  // ALCF's own policy can reject an otherwise-still-valid Globus token (a
  // "high-assurance timeout"): `is_authenticated` looks true, so the normal
  // action set would show Verify/Refresh/Sign out -- all misleading, since
  // no amount of verifying fixes a session Globus itself is refusing. This
  // is the ONE state that overrides the computed action entirely: ONE
  // button, "Sign in again", forcing a fresh login (never re-showing ready
  // controls that can't actually work).
  const needsForcedReauth = Boolean(
    preset.status_message?.includes('argonne_reauthentication_required'),
  );

  const readySignOut =
    action === 'none' && preset.is_authenticated
      ? preset.auth_method === 'oauth' || preset.auth_method === 'subscription'
        ? 'logout'
        : preset.requires_api_key
          ? 'remove_key'
          : undefined
      : undefined;

  return (
    <div className={cn('grid gap-2', compact ? 'gap-1.5' : 'gap-3')}>
      <div className={cn('flex flex-wrap items-center', compact ? 'gap-1' : 'gap-3')}>
        {needsForcedReauth ? (
          <Button
            className={compact ? 'h-7 px-2 text-xs' : undefined}
            disabled={actions.authenticate.isPending}
            onClick={() => actions.authenticate.mutate('browser')}
            size={compact ? 'sm' : undefined}
            variant="outline"
          >
            <KeyRoundIcon aria-hidden="true" className={compact ? 'size-3.5' : undefined} />
            {actions.authenticate.isPending ? 'Opening sign-in…' : 'Sign in again'}
          </Button>
        ) : action === 'sign_in' ? (
          <>
            <Button
              className={compact ? 'h-7 px-2 text-xs' : undefined}
              disabled={actions.authenticate.isPending}
              onClick={() => actions.authenticate.mutate('browser')}
              size={compact ? 'sm' : undefined}
              variant="outline"
            >
              <KeyRoundIcon aria-hidden="true" className={compact ? 'size-3.5' : undefined} />
              {actions.authenticate.isPending ? 'Opening sign-in…' : `Sign in${compact ? '' : ` to ${providerLabel}`}`}
            </Button>
            {preset.provider === 'codex' ? (
              <Button
                className={compact ? 'h-7 px-2 text-xs' : undefined}
                disabled={actions.authenticate.isPending}
                onClick={() => actions.authenticate.mutate('device')}
                size={compact ? 'sm' : undefined}
                variant="ghost"
              >
                {compact ? 'Device code' : 'Sign in with a device code'}
              </Button>
            ) : null}
            {!compact && preset.auth_method === 'oauth' && preset.auth_label ? (
              <span className="text-sm text-muted-foreground">Uses {preset.auth_label}</span>
            ) : null}
          </>
        ) : action === 'install' ? (
          <Button
            className={compact ? 'h-7 px-2 text-xs' : undefined}
            disabled={actions.installProvider.isPending}
            onClick={() => actions.installProvider.mutate()}
            size={compact ? 'sm' : undefined}
            variant="outline"
          >
            <DownloadIcon aria-hidden="true" className={compact ? 'size-3.5' : undefined} />
            {actions.installProvider.isPending ? `Installing ${providerLabel}…` : `Install ${providerLabel}`}
          </Button>
        ) : action === 'api_key' ? (
          <ProviderApiKeyField actions={actions} compact={compact} preset={preset} />
        ) : (
          <>
            {compact ? (
              <ProviderCheckControl actions={actions} compact preset={preset} />
            ) : (
              <>
                <Button
                  disabled={actions.refreshModels.isPending}
                  onClick={() => actions.refreshModels.mutate()}
                  variant="outline"
                >
                  <RefreshCwIcon
                    aria-hidden="true"
                    className={actions.refreshModels.isPending ? 'animate-spin' : undefined}
                  />
                  {actions.refreshModels.isPending ? 'Checking available models…' : 'Refresh model catalog'}
                </Button>
                <Button
                  disabled={actions.handshake.isPending}
                  onClick={() => actions.handshake.mutate()}
                  variant="outline"
                >
                  <RadioTowerIcon aria-hidden="true" />
                  {actions.handshake.isPending ? 'Checking provider…' : 'Verify provider'}
                </Button>
              </>
            )}
            {readySignOut === 'logout' ? (
              <Button
                className={compact ? 'h-7 px-2 text-xs' : undefined}
                disabled={actions.logout.isPending}
                onClick={() => actions.logout.mutate()}
                size={compact ? 'sm' : undefined}
                variant="ghost"
              >
                <LogOutIcon aria-hidden="true" className={compact ? 'size-3.5' : undefined} />
                {actions.logout.isPending ? 'Signing out…' : 'Sign out'}
              </Button>
            ) : readySignOut === 'remove_key' ? (
              <Button
                className={compact ? 'h-7 px-2 text-xs' : undefined}
                disabled={actions.removeApiKey.isPending}
                onClick={() => actions.removeApiKey.mutate()}
                size={compact ? 'sm' : undefined}
                variant="ghost"
              >
                {actions.removeApiKey.isPending ? 'Removing key…' : 'Remove key'}
              </Button>
            ) : null}
          </>
        )}
      </div>
      {actions.refreshModels.error ? (
        <p className="text-xs text-destructive">{actions.refreshModels.error.message}</p>
      ) : null}
      {actions.handshake.error ? (
        <p className="text-xs text-destructive">{actions.handshake.error.message}</p>
      ) : null}
      {actions.installProvider.error ? (
        <p className="text-xs text-destructive">{actions.installProvider.error.message}</p>
      ) : null}
      {actions.authenticate.error ? (
        <p className="text-xs text-destructive">{actions.authenticate.error.message}</p>
      ) : null}
      {actions.authFailedReason ? <p className="text-xs text-destructive">{actions.authFailedReason}</p> : null}
      {!compact && actions.authInstructions ? (
        <p className="max-w-3xl text-sm text-muted-foreground">{actions.authInstructions}</p>
      ) : null}
      {actions.logout.error ? (
        <p className="text-xs text-destructive">{actions.logout.error.message}</p>
      ) : null}
      {actions.removeApiKey.error ? (
        <p className="text-xs text-destructive">{actions.removeApiKey.error.message}</p>
      ) : null}
      {actions.authFlow ? (
        <ProviderAuthPanel
          authFlow={actions.authFlow}
          authPaste={actions.authPaste}
          completeError={actions.completeAuthentication.error?.message}
          completePending={actions.completeAuthentication.isPending}
          launchError={actions.authLaunchError}
          onComplete={() => actions.completeAuthentication.mutate()}
          onLaunchError={actions.setAuthLaunchError}
          onPasteChange={actions.setAuthPaste}
          pollingState={actions.authStatus.data?.state}
          providerLabel={providerLabel}
        />
      ) : null}
      {!compact && actions.refreshResult ? <RefreshResult result={actions.refreshResult} /> : null}
      {!compact && actions.handshakeResult ? <HandshakeResult result={actions.handshakeResult} /> : null}
    </div>
  );
}

function ProviderApiKeyField({
  actions,
  compact,
  preset,
}: {
  actions: ProviderActions;
  compact: boolean;
  preset: LanguageModelPreset;
}) {
  const [apiKey, setApiKey] = useState('');
  if (!compact) return null; // Settings keeps its own full API-key field alongside the rest of the form.
  return (
    <div className="flex items-center gap-1.5">
      <Input
        autoComplete="off"
        aria-label={`${providerDisplayName(preset)} API key`}
        className="h-7 text-xs"
        onChange={(event) => setApiKey(event.target.value)}
        placeholder="Enter a provider API key"
        type="password"
        value={apiKey}
      />
      <Button
        className="h-7 px-2 text-xs"
        disabled={!apiKey.trim() || actions.saveApiKey.isPending}
        onClick={() => actions.saveApiKey.mutate(apiKey)}
        size="sm"
        type="button"
        variant="outline"
      >
        {actions.saveApiKey.isPending ? 'Saving…' : 'Save key'}
      </Button>
      {actions.saveApiKey.error ? (
        <span className="text-xs text-destructive">{actions.saveApiKey.error.message}</span>
      ) : null}
    </div>
  );
}

/**
 * The check/refresh control: a single status icon that IS the trigger (v15
 * icon-and-colour-on-every-row rule) with the last result disclosed in a
 * HoverCard, rather than a separate button plus a paragraph of result text.
 */
function ProviderCheckControl({
  actions,
  compact,
  preset,
}: {
  actions: ProviderActions;
  compact: boolean;
  preset: LanguageModelPreset;
}) {
  if (!compact) return null;
  const pending = actions.handshake.isPending || actions.refreshModels.isPending;
  const failed = Boolean(actions.handshake.error || actions.refreshModels.error);
  const value = failed ? 'degraded' : preset.is_authenticated ? 'healthy' : 'unavailable';
  return (
    <HoverCard openDelay={180}>
      <HoverCardTrigger asChild>
        <button
          aria-label={`Check ${providerDisplayName(preset)}`}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          data-slot="provider-check-control"
          onClick={() => actions.handshake.mutate()}
          type="button"
        >
          {pending ? (
            <RefreshCwIcon aria-hidden="true" className="size-4 animate-spin text-muted-foreground" />
          ) : failed ? (
            <CircleAlertIcon aria-hidden="true" className="size-4 text-warning" />
          ) : (
            <ClioStatus compact suppressNativeTitle value={value} />
          )}
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-72 text-xs">
        {actions.handshakeResult ? (
          <HandshakeResult result={actions.handshakeResult} />
        ) : actions.refreshResult ? (
          <RefreshResult result={actions.refreshResult} />
        ) : (
          <p className="text-muted-foreground">Click to check this provider now.</p>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
