import type { ProviderAuthStart } from '@clio/core/v3';
import { CopyIcon, ExternalLinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ExternalLink } from '@/components/ui/external-link';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

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
  pollingState?: 'pending' | 'complete' | 'failed';
}

/**
 * Renders whichever methods the generic provider sign-in API's `start`
 * response offers (SPEC §6.12: `browser`/`device`, either or both), plus the
 * paste fallback every method races against. Shared by every subscription /
 * OAuth provider (ALCF today; the direct ChatGPT provider) so a new one needs
 * no new UI — only a new backend adapter.
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
  pollingState,
}: ProviderAuthPanelProps) {
  const { browser, device } = authFlow;
  return (
    <div
      aria-label={`Complete ${providerLabel} sign-in`}
      className="grid max-w-xl gap-3 rounded-lg border border-border bg-muted/20 p-4"
    >
      <div>
        <p className="font-medium">Finish signing in to {providerLabel}</p>
        <p className="text-sm text-muted-foreground">
          {device
            ? 'Enter the code below at the verification link, or paste the redirect URL here if you finished sign-in another way.'
            : `Sign in with your ${providerLabel} account. This updates automatically once you finish, or paste the redirect URL below.`}
        </p>
      </div>
      {browser ? (
        <div className="grid gap-1.5">
          <Button asChild className="w-fit" variant="outline">
            <ExternalLink
              href={browser.authorization_url}
              onClick={() => onLaunchError('')}
              onOpenError={(error) =>
                onLaunchError(error instanceof Error ? error.message : 'Could not open the sign-in page.')
              }
            >
              <ExternalLinkIcon aria-hidden="true" />
              Open browser
            </ExternalLink>
          </Button>
          {browser.loopback_unavailable_reason ? (
            <p className="text-xs text-muted-foreground">
              Automatic sign-in isn&apos;t available right now (the local port is busy) — paste the
              redirect URL below once you finish in the browser.
            </p>
          ) : null}
        </div>
      ) : null}
      {device ? (
        <div className="grid gap-2 rounded-md border border-dashed border-border p-3">
          <p className="text-xs font-medium text-muted-foreground">Enter this code</p>
          <div className="flex items-center gap-2">
            <code className="rounded bg-muted px-2 py-1 text-lg font-semibold tracking-widest">
              {device.user_code}
            </code>
            <Button
              aria-label="Copy code"
              onClick={() => void navigator.clipboard.writeText(device.user_code)}
              size="icon"
              variant="ghost"
            >
              <CopyIcon aria-hidden="true" className="size-4" />
            </Button>
          </div>
          <Button asChild className="w-fit" size="sm" variant="outline">
            <ExternalLink href={device.verification_url}>
              <ExternalLinkIcon aria-hidden="true" />
              Open verification page
            </ExternalLink>
          </Button>
        </div>
      ) : null}
      {launchError ? <p className="text-sm text-destructive">{launchError}</p> : null}
      {pollingState === 'pending' ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Spinner className="size-4" />
          Waiting for sign-in to finish…
        </p>
      ) : null}
      <div className="grid gap-1.5">
        <label className="text-sm font-medium" htmlFor="provider-auth-paste">
          Redirect URL or code
        </label>
        <Input
          autoComplete="one-time-code"
          id="provider-auth-paste"
          onChange={(event) => onPasteChange(event.target.value)}
          placeholder="Paste here if it didn't finish automatically"
          value={authPaste}
        />
      </div>
      <Button className="w-fit" disabled={!authPaste.trim() || completePending} onClick={onComplete}>
        {completePending ? 'Completing sign-in…' : 'Complete sign-in'}
      </Button>
      {completeError ? <p className="text-sm text-destructive">{completeError}</p> : null}
    </div>
  );
}
