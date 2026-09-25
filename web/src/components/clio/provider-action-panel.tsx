import type { LanguageModelPreset } from '@clio/core/v3';
import {
  DownloadIcon,
  KeyRoundIcon,
  LogOutIcon,
  RadioTowerIcon,
  RefreshCwIcon,
} from 'lucide-react';
import { useState, type ComponentType, type SVGProps } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  providerPrimaryAction,
  translateKnownProviderErrorReason,
} from '@/lib/provider-availability';
import { providerDisplayName } from '@/lib/provider-presentation';
import { cn } from '@/lib/utils';
import { ProviderAuthPanel } from './provider-auth-panel';
import type { useProviderActions } from './provider-actions';

export type ProviderActions = ReturnType<typeof useProviderActions>;

/** `sm`: the picker's strip; `default`: Settings > Providers. Size only, never behaviour. */
export type ProviderActionSize = 'sm' | 'default';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

interface ProviderActionPanelProps {
  preset: LanguageModelPreset | undefined;
  actions: ProviderActions;
  size?: ProviderActionSize;
  /**
   * The provider reason the caller already shows (the strip's detail line).
   * An action error with the same text is not repeated under it.
   */
  shownDetail?: string;
}

/**
 * The ONE implementation of "what does this provider need before its models
 * are usable" -- sign-in (OAuth/subscription), runtime install, an API key,
 * or just a check/refresh/sign-out control once it is ready. Used by both
 * the model picker's provider strip and Settings > Providers (through
 * `ProviderManagementStrip`), with identical labels, states and errors; only
 * the control size differs.
 *
 * Shows EXACTLY the action set the provider's own state calls for -- never
 * every action at once (a signed-out provider does not also offer to be
 * checked or signed out of; an installed-but-signed-out provider shows only
 * Sign in, not Install too). No action ever starts itself: every mutation
 * here fires only from an explicit click in this render, never a mount
 * effect -- a submenu opening must never open a browser or a device-code
 * prompt on its own.
 */
export function ProviderActionPanel({
  preset,
  actions,
  size = 'sm',
  shownDetail,
}: ProviderActionPanelProps) {
  const action = providerPrimaryAction(preset);
  const providerLabel = providerDisplayName(preset);

  if (!preset) return null;

  // ALCF's own policy can reject an otherwise-still-valid Globus token (a
  // "high-assurance timeout"): `is_authenticated` looks true, so the normal
  // action set would show Verify/Refresh/Sign out -- all misleading, since
  // no amount of verifying fixes a session Globus itself is refusing. This
  // is the ONE state that overrides the computed action entirely: ONE
  // button, "Sign in again", forcing a fresh login.
  const needsForcedReauth = Boolean(
    preset.status_message?.includes('argonne_reauthentication_required'),
  );

  const fresh = (message: string | undefined): string | undefined =>
    message && message !== shownDetail ? message : undefined;
  // Only a credential the provider refused or could not prove -- never, e.g.,
  // Codex's "sign-in required" for its OTHER transport after a good check.
  const handshakeReason =
    actions.handshakeResult?.error &&
    ['rejected', 'deferred'].includes(actions.handshakeResult.auth)
      ? fresh(translateKnownProviderErrorReason(actions.handshakeResult.error, providerLabel))
      : undefined;
  const refreshReason = actions.refreshResult?.failed_reason
    ? fresh(translateKnownProviderErrorReason(actions.refreshResult.failed_reason, providerLabel))
    : undefined;

  // One action at a time: while any runs (its stage shows beside the
  // heartbeat), every control waits for it to settle.
  const busy = Boolean(actions.stage);
  const control = (label: string, onClick: () => void, icon?: Icon, spinning = false) => (
    <ActionButton
      busy={busy}
      icon={icon}
      label={label}
      onClick={onClick}
      size={size}
      spinning={spinning}
    />
  );

  const readySignOut =
    action === 'none' && preset.is_authenticated
      ? preset.supports_logout
        ? 'logout'
        : preset.requires_api_key
          ? 'remove_key'
          : undefined
      : undefined;

  const errors = [
    ...new Set(
      [
        actions.refreshModels.error?.message,
        refreshReason,
        handshakeReason,
        actions.handshake.error?.message,
        actions.installProvider.error?.message,
        actions.authenticate.error?.message,
        actions.authFailedReason || undefined,
        actions.logout.error?.message,
        actions.removeApiKey.error?.message,
        fresh(actions.saveApiKey.error?.message),
      ].filter((message): message is string => Boolean(message)),
    ),
  ];

  return (
    <div className={cn('grid', size === 'sm' ? 'gap-1.5' : 'gap-2')}>
      <div className={cn('flex flex-wrap items-center', size === 'sm' ? 'gap-1' : 'gap-2')}>
        {needsForcedReauth ? (
          control('Sign in again', () => actions.authenticate.mutate('browser'), KeyRoundIcon)
        ) : action === 'sign_in' ? (
          <>
            {control('Sign in', () => actions.authenticate.mutate('browser'), KeyRoundIcon)}
            {preset.provider === 'codex'
              ? control('Device code', () => actions.authenticate.mutate('device'))
              : null}
          </>
        ) : action === 'install' ? (
          control('Install', () => actions.installProvider.mutate(), DownloadIcon)
        ) : action === 'api_key' ? (
          <ProviderApiKeyField actions={actions} preset={preset} size={size} />
        ) : (
          <>
            {control('Verify provider', () => actions.handshake.mutate(), RadioTowerIcon)}
            {control(
              'Refresh models',
              () => actions.refreshModels.mutate(),
              RefreshCwIcon,
              actions.refreshModels.isPending,
            )}
            {readySignOut === 'logout'
              ? control('Sign out', () => actions.logout.mutate(), LogOutIcon)
              : readySignOut === 'remove_key'
                ? control('Remove key', () => actions.removeApiKey.mutate(), KeyRoundIcon)
                : null}
          </>
        )}
      </div>
      {errors.map((message) => (
        <p className="text-xs text-destructive" key={message} role="alert">
          {message}
        </p>
      ))}
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
    </div>
  );
}

function ActionButton({
  busy,
  icon: ActionIcon,
  label,
  onClick,
  size,
  spinning,
}: {
  busy: boolean;
  icon?: Icon;
  label: string;
  onClick: () => void;
  size: ProviderActionSize;
  spinning: boolean;
}) {
  return (
    <Button
      className={size === 'sm' ? 'h-7 px-2 text-xs' : undefined}
      disabled={busy}
      onClick={onClick}
      size={size === 'sm' ? 'sm' : undefined}
      type="button"
      variant="outline"
    >
      {ActionIcon ? (
        <ActionIcon
          aria-hidden="true"
          className={cn(size === 'sm' && 'size-3.5', spinning && 'animate-spin')}
        />
      ) : null}
      {label}
    </Button>
  );
}

function ProviderApiKeyField({
  actions,
  preset,
  size,
}: {
  actions: ProviderActions;
  preset: LanguageModelPreset;
  size: ProviderActionSize;
}) {
  const [apiKey, setApiKey] = useState('');
  return (
    <div className="flex w-full max-w-md items-center gap-1.5">
      <Input
        autoComplete="off"
        aria-label={`${providerDisplayName(preset)} API key`}
        className={size === 'sm' ? 'h-7 text-xs' : undefined}
        onChange={(event) => setApiKey(event.target.value)}
        placeholder="Paste API key"
        type="password"
        value={apiKey}
      />
      <Button
        className={size === 'sm' ? 'h-7 px-2 text-xs' : undefined}
        disabled={!apiKey.trim() || Boolean(actions.stage)}
        size={size === 'sm' ? 'sm' : undefined}
        onClick={() => actions.saveApiKey.mutate(apiKey)}
        type="button"
        variant="outline"
      >
        Save key
      </Button>
    </div>
  );
}
