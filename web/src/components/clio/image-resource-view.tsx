import { DownloadIcon, Maximize2Icon, Minimize2Icon, ImageIcon } from 'lucide-react';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useObjectUrl } from '@/hooks/use-object-url';
import { OverlayContainer } from '@/components/ui/overlay-container';
import { FileViewerInformationHost } from './file-viewer-context';
import { ResourceLoading, ResourceUnavailable } from './resource-states';
import { downloadBytes } from './surface-export';
import { ToolbarAction, ViewerToolbarContent } from './viewer-toolbar';
import { ViewerToolbarHost } from './viewer-toolbar-context';
import { ViewerZoomControls } from './viewer-zoom-controls';

/** A fitted image with explicit zoom and ordinary scrolling. Images never pan or drag. */
export function ImageResourceView({
  bytes,
  error,
  mediaType,
  name,
}: {
  bytes?: Uint8Array;
  error?: string;
  mediaType: string;
  name: string;
}) {
  const url = useObjectUrl(bytes, mediaType);
  const toolbarHost = useContext(ViewerToolbarHost);
  const [localToolbarHost, setLocalToolbarHost] = useState<HTMLDivElement | null>(null);
  const shared = useContext(FileViewerInformationHost) !== undefined;
  const inheritedOverlay = useContext(OverlayContainer);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [fullscreenHost, setFullscreenHost] = useState<HTMLElement>();
  const fullscreen = Boolean(fullscreenHost);
  const [failedImageUrl, setFailedImageUrl] = useState<string>();
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [image, setImage] = useState({ url: '', width: 0, height: 0 });
  const [zoom, setZoom] = useState<{ url: string; scale: number }>();
  useEffect(() => {
    const host = viewportRef.current;
    if (!host) return;
    const update = () => setViewport({ width: host.clientWidth, height: host.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, [url, error]);
  useEffect(() => {
    const update = () =>
      setFullscreenHost(
        document.fullscreenElement === hostRef.current ? (hostRef.current ?? undefined) : undefined,
      );
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  const loaded = Boolean(url && image.url === url && image.width && image.height);
  const fit = loaded
    ? Math.min(
        Math.max(1, viewport.width - 32) / image.width,
        Math.max(1, viewport.height - 32) / image.height,
        1,
      )
    : 1;
  const scale = zoom && zoom.url === url ? zoom.scale : fit;
  const changeZoom = useCallback(
    (factor: number) => {
      if (url) setZoom({ url, scale: Math.min(8, Math.max(0.05, scale * factor)) });
    },
    [url, scale],
  );
  const zoomIn = useCallback(() => changeZoom(1.2), [changeZoom]);
  const zoomOut = useCallback(() => changeZoom(1 / 1.2), [changeZoom]);
  const reset = useCallback(() => {
    setZoom(undefined);
    viewportRef.current?.scrollTo?.({ top: 0, left: 0 });
  }, []);
  const toggleFullscreen = async () => {
    try {
      if (fullscreen) await document.exitFullscreen();
      else await hostRef.current?.requestFullscreen();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not open fullscreen.');
    }
  };
  if (error || (url && failedImageUrl === url))
    return (
      <ResourceUnavailable
        detail={error || 'The image bytes could not be decoded.'}
        icon={ImageIcon}
        label="Image preview unavailable"
      />
    );
  if (!url) return <ResourceLoading label={`Loading ${name}`} />;
  return (
    <OverlayContainer.Provider value={fullscreenHost ?? inheritedOverlay}>
      <ViewerToolbarHost.Provider value={shared ? toolbarHost : localToolbarHost}>
        <div
          ref={hostRef}
          className="@container/viewer flex h-full min-h-0 flex-col overflow-hidden bg-background"
        >
          {!shared ? (
            <div
              className="flex h-9 shrink-0 items-center justify-end gap-0.5 border-b px-2"
              ref={setLocalToolbarHost}
            />
          ) : null}
          {shared || localToolbarHost ? (
            <ViewerZoomControls
              percent={scale * 100}
              onIn={zoomIn}
              onOut={zoomOut}
              onFit={reset}
              labels={{
                in: 'Zoom in',
                out: 'Zoom out',
                reset: 'Reset image zoom',
                fit: 'Fit image to view',
                menu: 'Image actions',
              }}
            />
          ) : null}
          {!shared && localToolbarHost ? (
            <ViewerToolbarContent>
              <ToolbarAction
                label="Download file"
                onClick={() => downloadBytes(bytes!, mediaType, name)}
              >
                <DownloadIcon aria-hidden="true" />
              </ToolbarAction>
              <ToolbarAction
                label={fullscreen ? 'Exit image fullscreen' : 'View image fullscreen'}
                onClick={() => void toggleFullscreen()}
              >
                {fullscreen ? (
                  <Minimize2Icon aria-hidden="true" />
                ) : (
                  <Maximize2Icon aria-hidden="true" />
                )}
              </ToolbarAction>
            </ViewerToolbarContent>
          ) : null}
          <div
            ref={viewportRef}
            role="region"
            aria-label={`Zoomable image ${name}`}
            tabIndex={0}
            data-slot="image-viewport"
            className="min-h-0 flex-1 overflow-auto overscroll-contain bg-muted/15"
          >
            <div className="grid min-h-full min-w-full w-max content-start justify-items-center p-4">
              <img
                alt={name}
                src={url}
                draggable={false}
                onError={() => setFailedImageUrl(url)}
                onDragStart={(event) => event.preventDefault()}
                onLoad={(event) =>
                  setImage({
                    url,
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  })
                }
                className="block max-w-none select-none bg-[linear-gradient(45deg,var(--muted)_25%,transparent_25%),linear-gradient(-45deg,var(--muted)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,var(--muted)_75%),linear-gradient(-45deg,transparent_75%,var(--muted)_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px]"
                style={
                  loaded
                    ? { width: image.width * scale, height: image.height * scale }
                    : { maxWidth: '100%', visibility: 'hidden' }
                }
              />
            </div>
          </div>
        </div>
      </ViewerToolbarHost.Provider>
    </OverlayContainer.Provider>
  );
}
