import type { LanguageModelPreset } from '@clio/core/v3';
import {
  CircleAlertIcon,
  DownloadIcon,
  KeyRoundIcon,
  LogOutIcon,
  RadioTowerIcon,
  RefreshCwIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
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
  /**
   * The picker submenu auto-starts a browser sign-in the moment it opens for
   * an unauthenticated provider, so there is no separate "start" click before
   * the inline panel appears. Settings keeps its explicit "Sign in" button
   * (existing muscle memory; also avoids starting an OAuth flow -- and its
   * loopback listener -- every time the page loads).
   */
  autoStartAuth?: boolean;
}

/**
 * The ONE implementation of "what does this provider need before its models
 * are usable" -- sign-in (OAuth/subscription), runtime install (Claude Code),
 * an API key, or just a check/refresh control once it is ready. Used by both
 * the model picker's provider submenu and Settings > Providers so a fix or a
 * new provider kind lands in exactly one place.
 */
export function ProviderActionPanel({
  preset,
  actions,
  compact = false,
  autoStartAuth = false,
}: ProviderActionPanelProps) {
  const action = providerPrimaryAction(preset);
  const providerLabel = providerDisplayName(preset);
  const startedAuth = Boolean(actions.authFlow) || actions.authenticate.isPending;
  useEffect(() => {
    if (!autoStartAuth) return;
    if (action !== 'sign_in') return;
    if (startedAuth || actions.authInstructions) return;
    actions.authenticate.mutate('browser');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start once per (provider, action) pair, not on every actions identity change
  }, [autoStartAuth, action, preset?.id]);

  if (!preset) return null;

  return (
    <div className={cn('grid gap-2', compact ? 'gap-1.5' : 'gap-3')}>
      {compact ? (
        <div className="flex flex-wrap items-center gap-1">
          <ProviderCheckControl actions={actions} compact preset={preset} />
          {action === 'install' ? (
            <Button
              className="h-7 px-2 text-xs"
              disabled={actions.installProvider.isPending}
              onClick={() => actions.installProvider.mutate()}
              size="sm"
              type="button"
              variant="outline"
            >
              <DownloadIcon aria-hidden="true" className="size-3.5" />
              {actions.installProvider.isPending ? `Installing ${providerLabel}…` : `Install ${providerLabel}`}
            </Button>
          ) : null}
          {preset.is_authenticated &&
          (preset.auth_method === 'oauth' || preset.auth_method === 'subscription') ? (
            <Button
              className="h-7 px-2 text-xs"
              disabled={actions.logout.isPending}
              onClick={() => actions.logout.mutate()}
              size="sm"
              type="button"
              variant="ghost"
            >
              <LogOutIcon aria-hidden="true" className="size-3.5" />
              {actions.logout.isPending ? 'Signing out…' : 'Sign out'}
            </Button>
          ) : null}
          {actions.installProvider.error ? (
            <span className="text-xs text-destructive">{actions.installProvider.error.message}</span>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {action === 'sign_in' ? (
            <>
              <Button
                disabled={actions.authenticate.isPending}
                onClick={() => actions.authenticate.mutate('browser')}
                variant="outline"
              >
                <KeyRoundIcon aria-hidden="true" />
                {actions.authenticate.isPending ? 'Opening sign-in…' : `Sign in to ${providerLabel}`}
              </Button>
              {preset.provider === 'codex' ? (
                <Button
                  disabled={actions.authenticate.isPending}
                  onClick={() => actions.authenticate.mutate('device')}
                  variant="outline"
                >
                  Sign in with a device code
                </Button>
              ) : null}
            </>
          ) : null}
          {preset.is_authenticated &&
          (preset.auth_method === 'oauth' || preset.auth_method === 'subscription') ? (
            <Button disabled={actions.logout.isPending} onClick={() => actions.logout.mutate()} variant="outline">
              <LogOutIcon aria-hidden="true" />
              {actions.logout.isPending ? 'Signing out…' : 'Sign out'}
            </Button>
          ) : null}
          {preset.auth_method === 'oauth' && preset.auth_label ? (
            <span className="text-sm text-muted-foreground">Uses {preset.auth_label}</span>
          ) : null}
          {action === 'install' ? (
            <Button
              disabled={actions.installProvider.isPending}
              onClick={() => actions.installProvider.mutate()}
              variant="outline"
            >
              <DownloadIcon aria-hidden="true" />
              {actions.installProvider.isPending ? `Installing ${providerLabel}…` : `Install ${providerLabel}`}
            </Button>
          ) : null}
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
          <Button disabled={actions.handshake.isPending} onClick={() => actions.handshake.mutate()} variant="outline">
            <RadioTowerIcon aria-hidden="true" />
            {actions.handshake.isPending ? 'Checking provider…' : 'Check provider'}
          </Button>
        </div>
      )}
      {action === 'api_key' ? <ProviderApiKeyField actions={actions} compact={compact} preset={preset} /> : null}
      {!compact && actions.refreshModels.error ? (
        <p className="text-sm text-destructive">{actions.refreshModels.error.message}</p>
      ) : null}
      {!compact && actions.handshake.error ? (
        <p className="text-sm text-destructive">{actions.handshake.error.message}</p>
      ) : null}
      {!compact && actions.installProvider.error ? (
        <p className="text-sm text-destructive">{actions.installProvider.error.message}</p>
      ) : null}
      {!compact && actions.authenticate.error ? (
        <p className="text-sm text-destructive">{actions.authenticate.error.message}</p>
      ) : null}
      {actions.authFailedReason ? <p className="text-sm text-destructive">{actions.authFailedReason}</p> : null}
      {!compact && actions.authInstructions ? (
        <p className="max-w-3xl text-sm text-muted-foreground">{actions.authInstructions}</p>
      ) : null}
      {!compact && actions.logout.error ? (
        <p className="text-sm text-destructive">{actions.logout.error.message}</p>
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
