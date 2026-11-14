import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type WheelEvent,
} from 'react';
import { cn } from '@/lib/utils';
import type { BrowserInput } from './browser-live-socket';
import { BUTTONS, keyInput, pagePoint, type Viewport } from './browser-live-input';
import { t } from '@lingui/core/macro';

/**
 * The page's live frames, and the person's pointer, wheel and keys sent back to it.
 * Without input (view only) the frames are shown and nothing is sent.
 */
export function BrowserLiveView({
  frame,
  viewport,
  interactive,
  label,
  send,
  children,
}: {
  frame: Blob | null;
  viewport: Viewport;
  interactive: boolean;
  label: string;
  send: (input: BrowserInput) => void;
  /** Drawn over the frame (the comment region tool). */
  children?: ReactNode;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const moving = useRef<{ x: number; y: number } | null>(null);
  const frameRequest = useRef(0);

  useEffect(() => {
    if (!frame || !image.current) return;
    const url = URL.createObjectURL(frame);
    image.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [frame]);

  useEffect(() => () => cancelAnimationFrame(frameRequest.current), []);

  // The page lays out at this view's size, as in a browser window, so a narrow panel
  // shows the page's own narrow layout instead of a shrunken wide one.
  useEffect(() => {
    const element = surface.current;
    if (!interactive || !element || typeof ResizeObserver === 'undefined') return;
    let timer = 0;
    const report = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width >= 1 && height >= 1)
        send({ type: 'resize', width: Math.round(width), height: Math.round(height) });
    };
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(report, 150);
    });
    observer.observe(element);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [interactive, send]);

  const point = (event: { clientX: number; clientY: number }) => {
    const rect = surface.current?.getBoundingClientRect();
    return rect ? pagePoint(event.clientX, event.clientY, rect, viewport) : null;
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!interactive || event.pointerType === 'touch') return;
    moving.current = point(event);
    if (frameRequest.current) return;
    frameRequest.current = requestAnimationFrame(() => {
      frameRequest.current = 0;
      if (moving.current) send({ type: 'mouse', action: 'move', ...moving.current });
    });
  };

  const onPointerButton = (event: PointerEvent, action: 'down' | 'up') => {
    if (!interactive) return;
    const at = point(event);
    if (!at) return;
    if (action === 'down') surface.current?.focus();
    send({ type: 'mouse', action, ...at, button: BUTTONS[event.button] ?? 'left' });
  };

  const onWheel = (event: WheelEvent) => {
    if (!interactive) return;
    send({ type: 'wheel', dx: event.deltaX, dy: event.deltaY });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!interactive || event.key === 'Tab') return;
    event.preventDefault();
    send(keyInput(event));
  };

  return (
    <div
      ref={surface}
      role="application"
      aria-label={interactive ? t`${label}, live. Click to use the page.` : t`${label}, view only`}
      tabIndex={interactive ? 0 : -1}
      data-slot="browser-live-view"
      className={cn(
        'relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden bg-muted outline-none select-none',
        'focus-visible:ring-2 focus-visible:ring-ring',
        interactive ? 'cursor-default' : 'cursor-not-allowed',
      )}
      onPointerMove={onPointerMove}
      onPointerDown={(event) => onPointerButton(event, 'down')}
      onPointerUp={(event) => onPointerButton(event, 'up')}
      onContextMenu={(event) => event.preventDefault()}
      onWheel={onWheel}
      onKeyDown={onKeyDown}
      onPaste={(event) => {
        if (!interactive) return;
        const text = event.clipboardData.getData('text');
        if (text) send({ type: 'text', text });
      }}
    >
      {frame ? (
        // The frame fills the view (contained), as `pagePoint` and `frameRect` assume: a
        // frame narrower than the view (frames are capped in width) is scaled up, not
        // shown at its own size, or input and marks would land beside what they point at.
        <img
          ref={image}
          alt=""
          draggable={false}
          className="pointer-events-none h-full w-full object-contain"
        />
      ) : (
        <p className="text-sm text-muted-foreground">{t`Waiting for the page…`}</p>
      )}
      {children}
    </div>
  );
}
