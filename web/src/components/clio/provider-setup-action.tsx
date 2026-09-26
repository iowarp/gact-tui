import type { LanguageModelPreset } from '@clio/core/v3';
import { DownloadIcon, RefreshCwIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ProviderActionSteps, type ProviderActionFlow } from './provider-action-steps';
import { ProviderAuthPanel } from './provider-auth-panel';
import { ProviderLoginButton } from './provider-login-button';
import type { ProviderActions } from './provider-setup-state';

interface ProviderSetupActionProps {
  flow: ProviderActionFlow;
  preset: LanguageModelPreset | undefined;
  providerLabel: string;
  actions: ProviderActions;
  /** Offer logging in with a one-time code as the Log in button's second choice. */
  offerCode?: boolean;
  /** "Log in again" for a session the provider itself refuses. */
  loginLabel?: string;
  /** `center`: an empty state; `start`: under a section heading. */
  align?: 'center' | 'start';
  /** The provider was checked and failed: the check is offered "again". */
  failed?: boolean;
}

/**
 * The control for one setup flow -- key field + Connect, Log in, Install or
 * Check -- replaced by that flow's live steps while it runs, then by the
 * sign-in hand-off (browser, code, paste) while a log in waits for the
 * person. Every action goes through the shared action hook the rest of the
 * picker uses; nothing here starts on its own.
 */
export function ProviderSetupAction({
  flow,
  preset,
  providerLabel,
  actions,
  offerCode = false,
  loginLabel,
  align = 'center',
  failed = false,
}: ProviderSetupActionProps) {
  const [apiKey, setApiKey] = useState('');
  const busy = Boolean(actions.stage);
  const waitingForPerson = Boolean(actions.authFlow);

  return (
    <div
      className={cn('flex w-full flex-col gap-3', align === 'center' ? 'items-center' : 'items-start')}
      data-slot="provider-setup-action"
    >
      {actions.stage ? <ProviderActionSteps flow={flow} stage={actions.stage} /> : null}
      {waitingForPerson && actions.authFlow ? (
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
      ) : busy ? null : flow === 'api_key' ? (
        <form
          className="flex w-full max-w-sm items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (apiKey.trim()) actions.saveApiKey.mutate(apiKey);
          }}
        >
          <Input
            aria-label={`${providerLabel} key`}
            autoComplete="off"
            className="h-8"
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={`Paste your ${providerLabel.replace(/\s+API$/u, '')} key`}
            type="password"
            value={apiKey}
          />
          <Button disabled={!apiKey.trim() || !preset} size="sm" type="submit">
            Connect
          </Button>
        </form>
      ) : flow === 'sign_in' ? (
        <ProviderLoginButton
          label={loginLabel}
          onLogIn={() => actions.authenticate.mutate('browser')}
          onUseCode={offerCode ? () => actions.authenticate.mutate('device') : undefined}
        />
      ) : flow === 'install' ? (
        <Button onClick={() => actions.installProvider.mutate()} size="sm" type="button">
          <DownloadIcon data-icon="inline-start" />
          Install
        </Button>
      ) : (
        <Button onClick={() => actions.handshake.mutate()} size="sm" type="button" variant="outline">
          <RefreshCwIcon data-icon="inline-start" />
          {failed ? 'Check again' : 'Check'}
        </Button>
      )}
    </div>
  );
}
