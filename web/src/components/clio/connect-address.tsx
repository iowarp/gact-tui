import { TransportError } from '@clio/core/v3';
import { FileTextIcon, KeyRoundIcon, PaperclipIcon } from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { ConnectField, ConnectStatusLine, ConnectInput } from '@/components/clio/connect-frame';
import { IconButton } from '@/components/clio/primitives/icon-button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { internalException, UNEXPECTED_CONNECT_ERROR } from '@/hooks/use-connection-availability';
import { ServiceVersionError } from '@/lib/service-version-error';
import { RetryIcon } from '@/lib/icon-vocabulary';
import { vocab } from '@/lib/brand-vocabulary';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { cn } from '@/lib/utils';
import { t } from '@lingui/core/macro';

/** The spec's example address; the field itself starts empty. */
const ADDRESS_EXAMPLE = 'https://homelab.example.org:8100';

/** The smallest an example placeholder may shrink to fit, as a share of its font. */
const PLACEHOLDER_MIN_SCALE = 0.6;

/**
 * How the token field gives its whole placeholder room: beside the service name,
 * stacked under it, or stacked without the decorative key icon.
 */
type TokenRoom = 'side' | 'stack' | 'bare';

let measureCanvas: HTMLCanvasElement | undefined;

function textWidth(text: string, style: CSSStyleDeclaration): number {
  measureCanvas ??= document.createElement('canvas');
  const context = measureCanvas.getContext('2d');
  if (!context) return 0;
  context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  return context.measureText(text).width;
}

/**
 * Picks the token field's layout from widths that don't depend on that layout
 * (the fields' row, the paste button, the input's padding and font), so
 * switching never feeds back into the measurement.
 */
function useTokenRoom(
  grid: RefObject<HTMLDivElement | null>,
  input: RefObject<HTMLInputElement | null>,
  placeholder: string,
): TokenRoom {
  const [room, setRoom] = useState<TokenRoom>('side');
  useLayoutEffect(() => {
    const row = grid.current;
    const field = input.current;
    if (!row || !field) return;
    let frame = -1;
    const measure = () => {
      frame = -1;
      const box = field.parentElement;
      const line = box?.parentElement;
      if (!box || !line) return;
      const style = getComputedStyle(field);
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const beside = line.clientWidth - box.clientWidth;
      const chrome = field.offsetWidth - field.clientWidth + (parseFloat(style.paddingRight) || 0);
      const needed = Math.ceil(textWidth(placeholder, style)) + 1;
      const fits = (width: number, paddingLeft: number) =>
        width - beside - chrome - paddingLeft >= needed;
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      const full = row.clientWidth;
      const next: TokenRoom = fits((full - gap) / 2, 2 * rem)
        ? 'side'
        : fits(full, 2 * rem)
          ? 'stack'
          : 'bare';
      setRoom(next);
    };
    const schedule = () => {
      if (frame === -1) frame = requestAnimationFrame(measure);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    observer?.observe(row);
    void document.fonts?.ready.then(schedule);
    return () => {
      if (frame !== -1) cancelAnimationFrame(frame);
      frame = -1;
      observer?.disconnect();
    };
  }, [grid, input, placeholder]);
  return room;
}

/**
 * Shrinks a fixed example placeholder's own font just enough to show it whole
 * when the input is narrower than the example (narrow windows, large interface
 * sizes). The input's width never depends on its placeholder, so this can't loop;
 * the size is a CSS variable on the input, so nothing re-renders.
 */
function usePlaceholderFit(input: RefObject<HTMLInputElement | null>, placeholder: string) {
  useLayoutEffect(() => {
    const field = input.current;
    if (!field) return;
    let frame = -1;
    const measure = () => {
      frame = -1;
      const style = getComputedStyle(field);
      const room =
        field.clientWidth -
        (parseFloat(style.paddingLeft) || 0) -
        (parseFloat(style.paddingRight) || 0);
      const needed = textWidth(placeholder, style) + 1;
      const size = parseFloat(style.fontSize) || 0;
      if (room <= 0 || needed <= room || !size) {
        field.style.removeProperty('--placeholder-size');
        return;
      }
      const fitted = Math.max(
        size * PLACEHOLDER_MIN_SCALE,
        Math.floor((size * room * 10) / needed) / 10,
      );
      field.style.setProperty('--placeholder-size', `${fitted}px`);
    };
    const schedule = () => {
      if (frame === -1) frame = requestAnimationFrame(measure);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    observer?.observe(field);
    void document.fonts?.ready.then(schedule);
    return () => {
      if (frame !== -1) cancelAnimationFrame(frame);
      frame = -1;
      observer?.disconnect();
    };
  }, [input, placeholder]);
}

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
  const fields = useRef<HTMLDivElement>(null);
  const tokenInput = useRef<HTMLInputElement>(null);
  const tokenPlaceholder = t`Paste token`;
  const room = useTokenRoom(fields, tokenInput, tokenPlaceholder);
  usePlaceholderFit(address, ADDRESS_EXAMPLE);
  useEffect(() => address.current?.focus(), []);
  const paste = () => {
    void navigator.clipboard
      ?.readText()
      .then((text) => onTokenChange(text.trim()))
      .catch(() => undefined);
  };
  return (
    <>
      <ConnectField htmlFor="endpoint" label={t`Connection address`}>
        <ConnectInput
          aria-describedby="endpoint-hint"
          autoComplete="url"
          className="placeholder:[font-size:var(--placeholder-size)]"
          mono
          id="endpoint"
          onChange={(event) => onEndpointChange(event.target.value)}
          placeholder={ADDRESS_EXAMPLE}
          ref={address}
          required
          value={endpoint}
        />
        <span className="sr-only" id="endpoint-hint">
          {t`Use the agent service address, for example ${ADDRESS_EXAMPLE}. It can differ from this web page's address.`}
        </span>
      </ConnectField>
      <div
        className={cn('grid min-w-0 gap-2.5', room === 'side' ? 'grid-cols-2' : 'grid-cols-1')}
        data-token-room={room}
        ref={fields}
      >
        <ConnectField htmlFor="service-name" label={t`Service name`} optional>
          <ConnectInput
            autoComplete="off"
            id="service-name"
            onChange={(event) => onNameChange(event.target.value)}
            placeholder={t`Homelab`}
            value={name}
          />
        </ConnectField>
        <ConnectField htmlFor="token" label={t`Access token`} optional>
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="relative min-w-0 flex-1">
              {room === 'bare' ? null : (
                <KeyRoundIcon
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                />
              )}
              <ConnectInput
                autoComplete="off"
                className={room === 'bare' ? undefined : 'pl-8'}
                id="token"
                onChange={(event) => onTokenChange(event.target.value)}
                placeholder={tokenPlaceholder}
                ref={tokenInput}
                type="password"
                value={token}
              />
            </span>
            <IconButton
              icon={<PaperclipIcon />}
              label={t`Paste access token`}
              onClick={paste}
              size="sm"
              type="button"
            />
          </span>
        </ConnectField>
      </div>
      <ConnectStatusLine tone="lock">
        {inTauri() ? t`Token saved securely on this device.` : t`Token kept in memory only.`}
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
                label={t`Retry`}
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
                    label={t`Diagnostic details`}
                    size="sm"
                    type="button"
                  />
                </PopoverTrigger>
                <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] p-3">
                  <p className="text-meta font-medium">{t`Technical details`}</p>
                  <pre className="mt-2 max-h-56 overflow-auto font-mono text-caption whitespace-pre-wrap break-words text-muted-foreground">
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
      <span>{internal ? (title ? UNEXPECTED_CONNECT_ERROR : t`Unexpected error`) : reason}</span>
    </ConnectStatusLine>
  );
}
