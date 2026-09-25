import type { LanguageModelPreset } from '@clio/core/v3';
import {
  DownloadIcon,
  KeyRoundIcon,
  LogOutIcon,
  RadioTowerIcon,
  RefreshCwIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  providerPrimaryAction,
  translateKnownProviderErrorReason,
} from '@/lib/provider-availability';
import { providerDisplayName } from '@/lib/provider-presentation';
import { cn } from '@/lib/utils';
import { ProviderAuthPanel } from './provider-auth-panel';
import { HandshakeResult, RefreshResult } from './settings-models-results';
import type { useProviderSettingsActions } from './settings-models-actions';

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

  // One action at a time: while any runs (its stage shows in the strip, the
  // heartbeat and the bottom bar), every control waits for it to settle.
  const busy = Boolean(actions.stage);

  const readySignOut =
    action === 'none' && preset.is_authenticated
      ? preset.supports_logout
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
            disabled={busy}
            onClick={() => actions.authenticate.mutate('browser')}
            size={compact ? 'sm' : undefined}
            variant="outline"
          >
            <KeyRoundIcon aria-hidden="true" className={compact ? 'size-3.5' : undefined} />
            Sign in again
          </Button>
        ) : action === 'sign_in' ? (
          <>
            <Button
              className={compact ? 'h-7 px-2 text-xs' : undefined}
              disabled={busy}
              onClick={() => actions.authenticate.mutate('browser')}
              size={compact ? 'sm' : undefined}
              variant="outline"
            >
              <KeyRoundIcon aria-hidden="true" className={compact ? 'size-3.5' : undefined} />
              {compact ? 'Sign in' : `Sign in to ${providerLabel}`}
            </Button>
            {preset.provider === 'codex' ? (
              <Button
                className={compact ? 'h-7 px-2 text-xs' : undefined}
                disabled={busy}
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
            disabled={busy}
            onClick={() => actions.installProvider.mutate()}
            size={compact ? 'sm' : undefined}
            variant="outline"
          >
            <DownloadIcon aria-hidden="true" className={compact ? 'size-3.5' : undefined} />
            {compact ? 'Install' : `Install ${providerLabel}`}
          </Button>
        ) : action === 'api_key' ? (
          <ProviderApiKeyField actions={actions} compact={compact} preset={preset} />
        ) : (
          <>
            {/* Ready = two labelled actions, always -- an icon-only control
                (the old compact "just a status dot" affordance) never told
                anyone what clicking it would do. */}
            <Button
              className={compact ? 'h-7 px-2 text-xs' : undefined}
              disabled={busy}
              onClick={() => actions.handshake.mutate()}
              size={compact ? 'sm' : undefined}
              variant="outline"
            >
              <RadioTowerIcon aria-hidden="true" className={compact ? 'size-3.5' : undefined} />
              Verify provider
            </Button>
            <Button
              className={compact ? 'h-7 px-2 text-xs' : undefined}
              disabled={busy}
              onClick={() => actions.refreshModels.mutate()}
              size={compact ? 'sm' : undefined}
              variant="outline"
            >
              <RefreshCwIcon
                aria-hidden="true"
                className={cn(
                  compact ? 'size-3.5' : undefined,
                  actions.refreshModels.isPending && 'animate-spin',
                )}
              />
              Refresh models
            </Button>
            {readySignOut === 'logout' ? (
              <Button
                className={compact ? 'h-7 px-2 text-xs' : undefined}
                disabled={busy}
                onClick={() => actions.logout.mutate()}
                size={compact ? 'sm' : undefined}
                variant="ghost"
              >
                <LogOutIcon aria-hidden="true" className={compact ? 'size-3.5' : undefined} />
                Sign out
              </Button>
            ) : readySignOut === 'remove_key' ? (
              <Button
                className={compact ? 'h-7 px-2 text-xs' : undefined}
                disabled={busy}
                onClick={() => actions.removeApiKey.mutate()}
                size={compact ? 'sm' : undefined}
                variant="ghost"
              >
                <KeyRoundIcon aria-hidden="true" className={compact ? 'size-3.5' : undefined} />
                Remove key
              </Button>
            ) : null}
          </>
        )}
      </div>
      {/* The picker shows the stage in its own strip, heartbeat and bottom bar. */}
      {!compact && actions.stage ? (
        <p className="text-sm text-muted-foreground" role="status">
          {actions.stage}
        </p>
      ) : null}
      {actions.refreshModels.error ? (
        <p className="text-xs text-destructive">{actions.refreshModels.error.message}</p>
      ) : null}
      {compact && actions.handshakeResult?.error && actions.handshakeResult.auth !== 'ok' ? (
        <p className="text-xs text-destructive" title={actions.handshakeResult.error}>
          {translateKnownProviderErrorReason(actions.handshakeResult.error, providerLabel)}
        </p>
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
      {actions.saveApiKey.error ? (
        <p className="text-xs text-destructive">{actions.saveApiKey.error.message}</p>
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
        placeholder="Paste API key"
        type="password"
        value={apiKey}
      />
      <Button
        className="h-7 px-2 text-xs"
        disabled={!apiKey.trim() || Boolean(actions.stage)}
        onClick={() => actions.saveApiKey.mutate(apiKey)}
        size="sm"
        type="button"
        variant="outline"
      >
        Save key
      </Button>
    </div>
  );
}

