import { TransportError } from '@clio/core/v3';
import { ClipboardPasteIcon, FileTextIcon, KeyRoundIcon } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { ConnectField, ConnectStatusLine, ConnectInput } from '@/components/clio/connect-frame';
import { IconButton } from '@/components/clio/primitives/icon-button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { defaultEndpoint } from '@/lib/connection';
import { ServiceVersionError } from '@/lib/service-version-error';
import { RetryIcon } from '@/lib/icon-vocabulary';
import { inTauri } from '@/lib/transport/tauri-runtime';

/** Connect by address: the address first, then an optional name and token. */
export function ConnectAddressFields({
  endpoint,
  name,
  token,
  onEndpointChange,
  onNameChange,
  onTokenChange,
}: {
  endpoint: string;
  name: string;
  token: string;
  onEndpointChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onTokenChange: (value: string) => void;
}) {
  const address = useRef<HTMLInputElement>(null);
  useEffect(() => address.current?.focus(), []);
  const paste = () => {
    void navigator.clipboard
      ?.readText()
      .then((text) => onTokenChange(text.trim()))
      .catch(() => undefined);
  };
  return (
    <>
      <ConnectField htmlFor="endpoint" label="Connection address">
        <ConnectInput
          aria-describedby="endpoint-hint"
          autoComplete="url"
          mono
          id="endpoint"
          onChange={(event) => onEndpointChange(event.target.value)}
          placeholder={defaultEndpoint()}
          ref={address}
          required
          value={endpoint}
        />
        <span className="sr-only" id="endpoint-hint">
          Use the agent service address, for example {defaultEndpoint()}. It can differ from this
          web page's address.
        </span>
      </ConnectField>
      <div className="grid min-w-0 grid-cols-2 gap-2.5">
        <ConnectField htmlFor="service-name" label="Service name" optional>
          <ConnectInput
            autoComplete="off"
            id="service-name"
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="Homelab"
            value={name}
          />
        </ConnectField>
        <ConnectField htmlFor="token" label="Access token" optional>
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="relative min-w-0 flex-1">
              <KeyRoundIcon
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <ConnectInput
                autoComplete="off"
                className="pl-8"
                id="token"
                onChange={(event) => onTokenChange(event.target.value)}
                placeholder="Paste token"
                type="password"
                value={token}
              />
            </span>
            <IconButton
              icon={<ClipboardPasteIcon />}
              label="Paste access token"
              onClick={paste}
              size="sm"
              type="button"
            />
          </span>
        </ConnectField>
      </div>
      <ConnectStatusLine tone="lock">
        {inTauri() ? 'Token saved securely on this device.' : 'Token kept in memory only.'}
      </ConnectStatusLine>
    </>
  );
}

/**
 * A failure as one status line: what failed, why, and the next step. Raw
 * diagnostics stay behind the Diagnostic details button.
 */
export function ConnectErrorLine({
  error,
  title,
  onRetry,
  recovery,
}: {
  error: Error;
  title: string;
  onRetry?: () => void;
  recovery?: ReactNode;
}) {
  const details =
    error instanceof TransportError || error instanceof ServiceVersionError
      ? error.details
      : undefined;
  return (
    <ConnectStatusLine
      actions={
        recovery || onRetry || details ? (
          <>
            {recovery}
            {onRetry ? (
              <IconButton
                icon={<RetryIcon />}
                label="Retry"
                onClick={onRetry}
                size="sm"
                type="button"
              />
            ) : null}
            {details ? (
              <Popover>
                <PopoverTrigger asChild>
                  <IconButton
                    icon={<FileTextIcon />}
                    label="Diagnostic details"
                    size="sm"
                    type="button"
                  />
                </PopoverTrigger>
                <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] p-3">
                  <p className="text-[12px] font-medium">Technical details</p>
                  <pre className="mt-2 max-h-56 overflow-auto font-mono text-[11px] whitespace-pre-wrap break-words text-muted-foreground">
                    {JSON.stringify(details, null, 2)}
                  </pre>
                </PopoverContent>
              </Popover>
            ) : null}
          </>
        ) : undefined
      }
      role="alert"
      tone="error"
    >
      <span className="font-medium after:content-[':']">{title}</span> <span>{error.message}</span>
    </ConnectStatusLine>
  );
}
