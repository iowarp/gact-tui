import { DownloadIcon, ImageIcon, Maximize2Icon, Minimize2Icon } from 'lucide-react';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useObjectUrl } from '@/hooks/use-object-url';
import { OverlayContainer } from '@/components/ui/overlay-container';
import { FileViewerInformationHost } from './file-viewer-context';
import { useFileViewerFacts } from './file-viewer-facts';
import { ResourceLoading, ResourceUnavailable } from './resource-states';
import { downloadBytes } from './surface-export';
import { ToolbarAction, ViewerToolbarContent } from './viewer-toolbar';
import { ViewerToolbarHost } from './viewer-toolbar-context';
import { ViewerZoomControls } from './viewer-zoom-controls';
import { themedSvgBytes, useHtmlPreviewTheme } from './html-preview-theme';

const MAX_SCALE = 8;
const STEP = 1.2;

/**
 * An image centered on the viewer background, fitted to the window, with
 * explicit zoom and ordinary scrolling. Images never pan or drag. In a frame
 * the natural size and zoom are facts and Format holds zoom out and zoom in;
 * zooming out stops at the fitted size, which then follows the window. On its
 * own the image keeps one row with its size, zoom, Download and fullscreen.
 */
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
  const theme = useHtmlPreviewTheme();
  const displayBytes = useMemo(
    () =>
      bytes && mediaType.split(';', 1)[0]?.trim() === 'image/svg+xml'
        ? themedSvgBytes(bytes, theme)
        : bytes,
    [bytes, mediaType, theme],
  );
  const url = useObjectUrl(displayBytes, mediaType);
  const toolbarHost = useContext(ViewerToolbarHost);
  const [localToolbarHost, setLocalToolbarHost] = useState<HTMLDivElement | null>(null);
  const framed = useContext(FileViewerInformationHost) !== undefined;
  const inheritedOverlay = useContext(OverlayContainer);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [fullscreenHost, setFullscreenHost] = useState<HTMLElement>();
  const fullscreen = Boolean(fullscreenHost);
  const [failedImageUrl, setFailedImageUrl] = useState<string>();
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [image, setImage] = useState<{ bytes?: Uint8Array; width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const [zoom, setZoom] = useState<{ bytes: Uint8Array; scale: number }>();
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
  const loaded = Boolean(url && bytes && image.bytes === bytes && image.width && image.height);
  const fit = loaded
    ? Math.min(
        Math.max(1, viewport.width - 32) / image.width,
        Math.max(1, viewport.height - 32) / image.height,
        1,
      )
    : 1;
  const zoomed = zoom !== undefined && zoom.bytes === bytes;
  const scale = zoomed ? zoom.scale : fit;
  const dimensions = loaded ? `${image.width} × ${image.height}` : undefined;
  const percent = loaded ? `${Math.round(scale * 100)}%` : undefined;
  useFileViewerFacts(dimensions && percent ? [dimensions, percent] : undefined);
  const zoomIn = useCallback(() => {
    if (bytes) setZoom({ bytes, scale: Math.min(MAX_SCALE, scale * STEP) });
  }, [bytes, scale]);
  const zoomOut = useCallback(() => {
    const next = scale / STEP;
    // Reaching the fitted size hands the scale back to the window.
    if (!bytes || next <= fit + 1e-6) {
      setZoom(undefined);
      viewportRef.current?.scrollTo?.({ top: 0, left: 0 });
    } else setZoom({ bytes, scale: next });
  }, [bytes, fit, scale]);
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
      <ViewerToolbarHost.Provider value={framed ? toolbarHost : localToolbarHost}>
        <div
          ref={hostRef}
          className="@container/viewer flex h-full min-h-0 flex-col overflow-hidden bg-background"
        >
          {!framed ? (
            <div className="flex h-[34px] shrink-0 items-center gap-px border-b border-border px-1.5">
              <span className="flex min-w-0 flex-1 gap-2 truncate px-1.5 text-[11px] text-muted-foreground tabular-nums">
                {dimensions ? <span>{dimensions}</span> : null}
                {percent ? <span>{percent}</span> : null}
              </span>
              <div className="flex shrink-0 items-center gap-px" ref={setLocalToolbarHost} />
            </div>
          ) : null}
          {framed || localToolbarHost ? (
            <ViewerZoomControls
              label="Image zoom"
              onIn={zoomIn}
              onOut={zoomOut}
              disabledIn={scale >= MAX_SCALE}
              disabledOut={!zoomed}
            />
          ) : null}
          {!framed && localToolbarHost && bytes ? (
            <ViewerToolbarContent>
              <ToolbarAction
                label="Download file"
                onClick={() => downloadBytes(bytes, mediaType, name)}
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
            className="min-h-0 flex-1 overflow-auto overscroll-contain bg-background"
          >
            <div className="grid min-h-full w-max min-w-full place-content-center place-items-center p-4">
              <img
                alt={name}
                src={url}
                draggable={false}
                onError={() => setFailedImageUrl(url)}
                onDragStart={(event) => event.preventDefault()}
                onLoad={(event) =>
                  setImage({
                    bytes,
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
