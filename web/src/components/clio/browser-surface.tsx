import type { BrowserLiveState } from '@clio/core/v3';
import { useQueryClient } from '@tanstack/react-query';
import { BanIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { BrowserCertificateNotice } from './browser-certificate-notice';
import { BrowserFrame } from './browser-frame';
import { BrowserLiveView } from './browser-live-view';
import { useCommentSession } from './comments/comment-session';
import { FrameCommentsIcon, FrameCommentsUnavailable } from './comments/frame-comments';
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

/** The frame's Comments icon on a page: the shared session's count, toggling its controls. */
function BrowserCommentsIcon({ interactive }: { interactive: boolean }) {
  const session = useCommentSession();
  if (!session || !interactive)
    return <FrameCommentsUnavailable reason="Comments open once the page is live here" />;
  return (
    <FrameCommentsIcon
      count={session.threadCount + session.marks.length}
      pressed={session.open}
      onClick={() => (session.open ? session.stop() : session.start())}
    />
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
 * The Browser surface: one page the person and the agent share, live, in the one frame row
 * (`BrowserFrame`). Back, forward, reload and the address act on the page; Reload's place
 * shows the load, and the row's facts say when the agent is acting, when this window only
 * views it and when Chromium's sandbox is off. Below the row, notices say when the
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
    <BrowserPageComments
      interactive={interactive}
      page={page}
      subscribe={subscribePicks}
      send={send}
    >
      <BrowserFrame
        comments={<BrowserCommentsIcon interactive={interactive} />}
        editable={interactive}
        facts={
          <>
            {state?.agent_acting ? (
              <span title={state.last_action || undefined}>Agent acting</span>
            ) : null}
            {state?.view_only ? (
              <span title="Another window is using this page">View only</span>
            ) : null}
            {state?.sandbox_off ? (
              <span title={state.sandbox_reason || undefined}>Sandbox off</span>
            ) : null}
          </>
        }
        label={label}
        loading={Boolean(state?.loading)}
        navigation={
          interactive
            ? {
                back: () => send({ type: 'navigate', action: 'back' }),
                forward: () => send({ type: 'navigate', action: 'forward' }),
                reload: () => send({ type: 'navigate', action: 'reload' }),
              }
            : undefined
        }
        navigationReason={
          state?.view_only ? 'Another window is using this page' : 'The page is not live'
        }
        onGo={(url) => send({ type: 'navigate', action: 'goto', url })}
        screenshot={() => frame}
        title={state?.title || label}
        url={state?.url ?? ''}
      >
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
              <Button size="sm" variant="outline" disabled={allowing} onClick={() => void allow()}>
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
      </BrowserFrame>
    </BrowserPageComments>
  );
}
