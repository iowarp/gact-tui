import { TransportError } from '@clio/core/v3';
import { FileTextIcon, KeyRoundIcon, PaperclipIcon } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { ConnectField, ConnectStatusLine, ConnectInput } from '@/components/clio/connect-frame';
import { IconButton } from '@/components/clio/primitives/icon-button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { internalException, UNEXPECTED_CONNECT_ERROR } from '@/hooks/use-connection-availability';
import { ServiceVersionError } from '@/lib/service-version-error';
import { RetryIcon } from '@/lib/icon-vocabulary';
import { vocab } from '@/lib/brand-vocabulary';
import { inTauri } from '@/lib/transport/tauri-runtime';

/** The spec's example address; the field itself starts empty. */
const ADDRESS_EXAMPLE = 'https://homelab.example.org:8100';

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
          placeholder={ADDRESS_EXAMPLE}
          ref={address}
          required
          value={endpoint}
        />
        <span className="sr-only" id="endpoint-hint">
          Use the agent service address, for example {ADDRESS_EXAMPLE}. It can differ from this web
          page's address.
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
              icon={<PaperclipIcon />}
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
 * The reason a connect attempt failed, in the spec's plain words, for the causes the
 * person can act on: nothing answered, or the agent wants a (different) access token.
 * Anything else keeps the service's own message.
 */
function connectFailureReason(error: Error, tokenSent = false): string {
  if (!(error instanceof TransportError)) return error.message;
  if (error.code === 'network_unavailable') return `no ${vocab.product} answered at that address.`;
  if (error.status === 401) {
    return tokenSent
      ? 'the agent did not accept that access token.'
      : 'this agent needs an access token.';
  }
  if (error.status === 403) return 'that access token is not allowed on this agent.';
  return error.message;
}

/**
 * A failure as one status line: what failed, why, and the next step. Raw
 * diagnostics, including an unexpected exception's own text, stay behind the
 * Diagnostic details button. Without a title the line gives only the reason,
 * for when the failure's headline is already shown nearby.
 */
export function ConnectErrorLine({
  error,
  title,
  onRetry,
  recovery,
  tokenSent,
}: {
  error: Error;
  title?: string;
  tokenSent?: boolean;
  onRetry?: () => void;
  recovery?: ReactNode;
}) {
  const internal = internalException(error);
  const reason = internal ? undefined : connectFailureReason(error, tokenSent);
  const replaced = reason !== undefined && reason !== error.message;
  const details = internal
    ? { error: internal }
    : error instanceof TransportError || error instanceof ServiceVersionError
      ? replaced
        ? {
            message: error.message,
            ...(error instanceof TransportError && error.status !== undefined
              ? { status: error.status }
              : {}),
            ...(error.details ? { details: error.details } : {}),
          }
        : error.details
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
      {title ? (
        <>
          <span className="font-medium after:content-[':']">{title}</span>{' '}
        </>
      ) : null}
      <span>
        {internal ? (title ? UNEXPECTED_CONNECT_ERROR : 'Unexpected error') : reason}
      </span>
    </ConnectStatusLine>
  );
}
