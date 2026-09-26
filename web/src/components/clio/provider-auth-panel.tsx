import type { ProviderAuthStart } from '@clio/core/v3';
import { CopyIcon, ExternalLinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ExternalLink } from '@/components/ui/external-link';
import { Input } from '@/components/ui/input';
import { InfoTip } from './info-tip';

interface ProviderAuthPanelProps {
  providerLabel: string;
  authFlow: ProviderAuthStart;
  authPaste: string;
  onPasteChange: (value: string) => void;
  onComplete: () => void;
  completePending: boolean;
  completeError?: string;
  launchError: string;
  onLaunchError: (message: string) => void;
  /** Kept for callers; the running steps already say the flow is waiting. */
  pollingState?: 'pending' | 'complete' | 'failed';
}

/**
 * The hand-off while a log in waits for the person: whichever methods the
 * generic provider sign-in API's `start` response offers (SPEC §6.12:
 * `browser`/`device`, either or both), plus the paste fallback every method
 * races against. Compact by design -- it sits under the running steps, which
 * already say it is waiting. Shared by every subscription / OAuth provider,
 * so a new one needs no new UI, only a backend adapter.
 */
export function ProviderAuthPanel({
  providerLabel,
  authFlow,
  authPaste,
  onPasteChange,
  onComplete,
  completePending,
  completeError,
  launchError,
  onLaunchError,
}: ProviderAuthPanelProps) {
  const { browser, device } = authFlow;
  return (
    <div
      aria-label={`Complete ${providerLabel} sign-in`}
      className="flex w-full max-w-md flex-col gap-2"
      data-slot="provider-auth-panel"
      role="group"
    >
      {device ? (
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded bg-muted px-2 py-1 text-base font-semibold tracking-widest">
            {device.user_code}
          </code>
          <Button
            aria-label="Copy code"
            onClick={() => void navigator.clipboard.writeText(device.user_code)}
            size="icon-sm"
            variant="ghost"
          >
            <CopyIcon aria-hidden="true" />
          </Button>
          <Button asChild size="sm" variant="outline">
            <ExternalLink href={device.verification_url}>
              <ExternalLinkIcon data-icon="inline-start" />
              Enter the code
            </ExternalLink>
          </Button>
        </div>
      ) : null}
      {browser ? (
        <div className="flex items-center gap-1.5">
          <Button asChild size="sm" variant="outline">
            <ExternalLink
              href={browser.authorization_url}
              onClick={() => onLaunchError('')}
              onOpenError={(error) =>
                onLaunchError(error instanceof Error ? error.message : 'Could not open the sign-in page.')
              }
            >
              <ExternalLinkIcon data-icon="inline-start" />
              Open sign-in page
            </ExternalLink>
          </Button>
          {browser.loopback_unavailable_reason ? (
            <InfoTip label="Automatic sign-in unavailable">
              Automatic sign-in isn&apos;t available right now (the local port is busy). Paste the
              redirect URL below once you finish in the browser.
            </InfoTip>
          ) : null}
        </div>
      ) : null}
      {launchError ? <p className="text-xs text-destructive">{launchError}</p> : null}
      <form
        className="flex items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (authPaste.trim() && !completePending) onComplete();
        }}
      >
        <Input
          aria-label="Redirect URL or code"
          autoComplete="one-time-code"
          className="h-7 text-xs"
          id="provider-auth-paste"
          onChange={(event) => onPasteChange(event.target.value)}
          placeholder="Didn't finish? Paste the address or code here"
          value={authPaste}
        />
        <Button disabled={!authPaste.trim() || completePending} size="sm" type="submit">
          {completePending ? 'Finishing…' : 'Finish'}
        </Button>
      </form>
      {completeError ? <p className="text-xs text-destructive">{completeError}</p> : null}
    </div>
  );
}
