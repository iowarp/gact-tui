import { useCallback, useEffect, useState, type RefObject } from 'react';
import { toast } from 'sonner';
import { t } from '@lingui/core/macro';

/**
 * Native fullscreen for one element: the element while it is fullscreen (the
 * overlay container then), and a toggle. Esc only leaves fullscreen; a
 * maximized canvas behind it stays as it was. A menu or dialog open inside
 * still closes first.
 */
export function useElementFullscreen(host: RefObject<HTMLElement | null>) {
  const [fullscreenHost, setFullscreenHost] = useState<HTMLElement>();
  const fullscreen = Boolean(fullscreenHost);
  useEffect(() => {
    const update = () =>
      setFullscreenHost(
        document.fullscreenElement === host.current ? (host.current ?? undefined) : undefined,
      );
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, [host]);
  useEffect(() => {
    if (!fullscreen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      const element = host.current;
      if (event.key !== 'Escape' || !element || document.fullscreenElement !== element) return;
      if (element.querySelector('[role="menu"], [role="dialog"], [role="listbox"]')) return;
      event.preventDefault();
      event.stopPropagation();
      void document.exitFullscreen();
    };
    // Window capture runs before the layers that listen on the document.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [fullscreen, host]);
  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement === host.current) await document.exitFullscreen();
      else await host.current?.requestFullscreen();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t`Could not open fullscreen.`);
    }
  }, [host]);
  return { fullscreenHost, fullscreen, toggle };
}
