import type { BrowserLiveState } from '@clio/core/v3';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BanIcon,
  BotIcon,
  EyeIcon,
  LoaderCircleIcon,
  ShieldAlertIcon,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useRepository } from '@/hooks/use-repository';
import { RefreshIcon } from '@/lib/icon-vocabulary';
import { useConnectionSettings } from '@/providers/connection-provider';
import { BrowserCertificateNotice } from './browser-certificate-notice';
import { BrowserLiveView } from './browser-live-view';
import { CommentToggle } from './comments/comment-capture';
import {
  BrowserPageComments,
  BrowserRegionCapture,
  type SubscribePicks,
} from './comments/browser-page-comments';
import type { Viewport } from './browser-live-input';
import {
  liveRefusalMessage,
  openBrowserLive,
  type BrowserInput,
  type BrowserLiveConnection,
} from './browser-live-socket';
import { browserPagesKey } from './use-browser-pages';

/** One status of the shared page: an icon whose meaning is in its label and on hover. */
function StatusIcon({
  label,
  detail,
  children,
}: {
  label: string;
  detail?: string;
  children: ReactNode;
}) {
  const text = detail ? `${label}: ${detail}` : label;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={text}
          tabIndex={0}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}

function accentColor(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
  if (/^#[0-9a-f]{3,6}$/iu.test(value)) return value;
  const probe = document.createElement('span');
  probe.style.color = 'var(--primary)';
  document.body.append(probe);
  const rgb = getComputedStyle(probe).color.match(/\d+/gu)?.slice(0, 3).map(Number) ?? [];
  probe.remove();
  return rgb.length === 3 ? `#${rgb.map((n) => n.toString(16).padStart(2, '0')).join('')}` : '';
}

/**
 * The Browser surface: one page the person and the agent share, live. The URL bar, back,
 * forward and reload act on the page; status icons say when it is loading, when the agent
 * is acting, when this window only views it, when Chromium's sandbox is off, when the
 * page was refused a site (with a control to allow it for this conversation), and when it
 * shows a certificate warning (with a control to trust that certificate).
 */
export function BrowserSurface({
  sessionId,
  pageId,
  label,
}: {
  sessionId: string;
  pageId: string;
  label: string;
}) {
  const { settings } = useConnectionSettings();
  const repository = useRepository();
  const queryClient = useQueryClient();
  const [frame, setFrame] = useState<Blob | null>(null);
  const [state, setState] = useState<BrowserLiveState | null>(null);
  const [ended, setEnded] = useState('');
  const [notice, setNotice] = useState('');
  const [address, setAddress] = useState('');
  const [editing, setEditing] = useState(false);
  const [allowing, setAllowing] = useState(false);
  const connection = useRef<BrowserLiveConnection | null>(null);
  const pickListeners = useRef(new Set<(anchor: unknown) => void>());
  const subscribePicks = useCallback<SubscribePicks>((listener) => {
    const listeners = pickListeners.current;
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    let disposed = false; // a socket this view closed itself reports nothing back
    const live = openBrowserLive(settings.endpoint, settings.token, sessionId, pageId, {
      onFrame: (next) => {
        if (!disposed) setFrame(next);
      },
      onState: (next) => {
        if (disposed) return;
        setState(next);
        setEnded('');
        if (next.navigation_blocked === null) setNotice('');
      },
      onPick: (anchor) => {
        if (!disposed) for (const listener of pickListeners.current) listener(anchor);
      },
      onNotice: (reason) => {
        if (!disposed)
          setNotice(reason === 'view_only' ? 'Another window is using this page.' : '');
      },
      onClose: (code, reason) => {
        if (disposed) return;
        if (code !== 1000) setEnded(liveRefusalMessage(code, reason));
        void queryClient.invalidateQueries({
          queryKey: browserPagesKey(settings.endpoint, sessionId),
        });
      },
    });
    connection.current = live;
    const accent = accentColor();
    const greet = window.setTimeout(() => accent && live.send({ type: 'theme', accent }), 300);
    return () => {
      disposed = true;
      window.clearTimeout(greet);
      live.close();
      connection.current = null;
    };
  }, [pageId, queryClient, sessionId, settings.endpoint, settings.token]);

  const send = useCallback((input: BrowserInput) => connection.current?.send(input), []);
  const viewport: Viewport = state?.viewport ?? { width: 0, height: 0 };
  const interactive = Boolean(state && !state.view_only && !ended);

  const go = (event: FormEvent) => {
    event.preventDefault();
    const url = address.trim();
    if (url) send({ type: 'navigate', action: 'goto', url });
    setEditing(false);
  };

  const allow = async () => {
    setAllowing(true);
    try {
      await repository.allowBrowserHost(sessionId, pageId);
    } finally {
      setAllowing(false);
    }
  };

  const blocked = state?.navigation_blocked ?? null;
  const page = { id: pageId, url: state?.url ?? '', title: state?.title || label };
  return (
    <TooltipProvider>
      <BrowserPageComments page={page} subscribe={subscribePicks} send={send}>
        <section
          aria-label={`Browser: ${label}`}
          className="flex h-full min-h-0 flex-col"
          data-slot="browser-surface"
        >
          <form onSubmit={go} className="flex items-center gap-1 border-b border-border p-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Back"
              disabled={!interactive}
              onClick={() => send({ type: 'navigate', action: 'back' })}
            >
              <ArrowLeftIcon aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Forward"
              disabled={!interactive}
              onClick={() => send({ type: 'navigate', action: 'forward' })}
            >
              <ArrowRightIcon aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Reload"
              disabled={!interactive}
              onClick={() => send({ type: 'navigate', action: 'reload' })}
            >
              <RefreshIcon aria-hidden />
            </Button>
            <Input
              aria-label="Address"
              value={editing ? address : (state?.url ?? '')}
              readOnly={!interactive}
              onFocus={() => {
                setAddress(state?.url ?? '');
                setEditing(true);
              }}
              onBlur={() => setEditing(false)}
              onChange={(event) => setAddress(event.target.value)}
              className="h-8 min-w-0 flex-1 font-mono text-xs"
              spellCheck={false}
            />
            {interactive ? <CommentToggle /> : null}
            {state?.loading ? (
              <StatusIcon label="Loading">
                <LoaderCircleIcon aria-hidden className="size-4 motion-safe:animate-spin" />
              </StatusIcon>
            ) : null}
            {state?.agent_acting ? (
              <StatusIcon label="Agent acting" detail={state.last_action || undefined}>
                <BotIcon aria-hidden className="size-4" />
              </StatusIcon>
            ) : null}
            {state?.view_only ? (
              <StatusIcon label="View only" detail="Another window is using this page">
                <EyeIcon aria-hidden className="size-4" />
              </StatusIcon>
            ) : null}
            {state?.sandbox_off ? (
              <StatusIcon label="Browser sandbox off" detail={state.sandbox_reason || undefined}>
                <ShieldAlertIcon aria-hidden className="size-4" />
              </StatusIcon>
            ) : null}
          </form>
          {blocked ? (
            <div
              role="status"
              className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-1.5 text-sm"
            >
              <BanIcon aria-hidden className="size-4 shrink-0" />
              <span className="min-w-0 flex-1">
                {blocked.reason === 'browser_scheme_refused' ? (
                  <>
                    The page tried to open a <strong className="font-medium">{blocked.host}</strong>{' '}
                    address. The shared browser opens only web pages.
                  </>
                ) : (
                  <>
                    The page could not open{' '}
                    <strong className="font-medium">{blocked.host || 'its next page'}</strong> and
                    stayed here.
                  </>
                )}
              </span>
              {blocked.reason !== 'browser_scheme_refused' && blocked.host ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={allowing}
                  onClick={() => void allow()}
                >
                  Try again
                </Button>
              ) : null}
            </div>
          ) : null}
          {state?.certificate_untrusted ? (
            <BrowserCertificateNotice
              key={state.certificate_untrusted.fingerprint}
              sessionId={sessionId}
              pageId={pageId}
              certificate={state.certificate_untrusted}
            />
          ) : null}
          {ended ? (
            <p role="status" className="px-3 py-2 text-sm text-muted-foreground">
              {ended}
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="px-3 py-1 text-xs text-muted-foreground">
              {notice}
            </p>
          ) : null}
          <BrowserLiveView
            frame={frame}
            viewport={viewport}
            interactive={interactive}
            label={state?.title || label}
            send={send}
          >
            <BrowserRegionCapture page={page} state={state} />
          </BrowserLiveView>
        </section>
      </BrowserPageComments>
    </TooltipProvider>
  );
}
