'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { isMacOS } from '@/lib/platform';
import { AlertTriangleIcon, Loader2 } from 'lucide-react';

/**
 * #1549 G9 #27 follow-up (adversarial review of #514): the wheel listener
 * below only zooms on Ctrl/Meta+wheel now, so the toolbar hint that used to
 * say "Scroll to zoom" was stale everywhere it was copy-pasted
 * (`mermaid-preview.tsx`, and `resource-viewers.tsx`'s image viewer, which
 * also renders this component). One shared string names the actual
 * modifier, showing the Mac glyph on Mac hosts. There's no separate
 * "or when the canvas is focused" exception: `handleKeyDown` already zooms
 * on a focused canvas via `+`/`-`/`0`, so a focused plain wheel keeping its
 * own Ctrl/Meta gate is consistent, not a gap.
 */
export function zoomScrollHint(): string {
  return `${isMacOS() ? '⌘' : 'Ctrl'}+scroll or pinch to zoom, drag to pan`;
}

export interface ZoomPanProps {
  imageSrc?: string;
  ariaLabel?: string;
  children?: React.ReactNode;
  minScale?: number;
  maxScale?: number;
  initialScale?: number;
  zoomStep?: number;
  className?: string;
  viewportClassName?: string;
  viewportMode?: 'fill' | 'image-aspect';
  fitPadding?: number;
  wheelZoom?: 'modifier' | 'plain';
  onLoad?: () => void;
  onError?: (error: Error) => void;
  controls?: (api: {
    zoomIn: () => void;
    zoomOut: () => void;
    resetZoom: () => void;
    centerView: () => void;
    scalePercent: number;
  }) => React.ReactNode;
  isLoading?: boolean;
  loadingFallback?: React.ReactNode;
  error?: string;
  hitRegions?: readonly { id: string; x: number; y: number; width: number; height: number }[];
  selectedRegionIds?: readonly string[];
  onRegionClick?: (id: string, modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void;
}

export function ZoomPan({
  imageSrc,
  ariaLabel = 'Interactive diagram canvas',
  children,
  minScale = 0.1,
  maxScale = 5,
  initialScale = 1,
  zoomStep = 0.1,
  className = '',
  viewportClassName = '',
  viewportMode = 'fill',
  fitPadding = 0.9,
  wheelZoom = 'modifier',
  onLoad,
  onError,
  controls,
  isLoading = false,
  loadingFallback,
  error,
  hitRegions,
  selectedRegionIds,
  onRegionClick,
}: ZoomPanProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const imageRef = React.useRef<HTMLImageElement | null>(null);
  const hitRegionsRef = React.useRef(hitRegions);
  const selectedRegionIdsRef = React.useRef(selectedRegionIds);
  const onRegionClickRef = React.useRef(onRegionClick);
  const [imageDimensions, setImageDimensions] = React.useState<Dimensions>();
  const [stageDimensions, setStageDimensions] = React.useState<Dimensions>();

  // Transform refs
  const currentRef = React.useRef({ x: 0, y: 0, scale: initialScale });
  const targetRef = React.useRef({ x: 0, y: 0, scale: initialScale });

  // UI state for controls
  const [scalePercent, setScalePercent] = React.useState(Math.round(initialScale * 100));
  const [imageError, setImageError] = React.useState<string>();

  // Interaction refs
  const isDragging = React.useRef(false);
  const isPinching = React.useRef(false);
  const panStartRef = React.useRef({ x: 0, y: 0 });
  const targetStartRef = React.useRef({ x: 0, y: 0 });

  // Animation/Raf ref
  const rafRef = React.useRef<number | null>(null);
  const hasCentered = React.useRef(false);
  const isFitView = React.useRef(true);

  const viewportDimensions = React.useMemo(() => {
    if (viewportMode !== 'image-aspect' || !stageDimensions || !imageDimensions) {
      return undefined;
    }
    return fitAspectRatioViewport(stageDimensions, imageDimensions);
  }, [imageDimensions, stageDimensions, viewportMode]);

  // Touch refs
  const touchStartRef = React.useRef<{
    touches: Array<{ x: number; y: number }>;
    translateX: number;
    translateY: number;
    scale: number;
    distance: number;
    center: { x: number; y: number };
  } | null>(null);

  const getTouchDistance = (touches: React.TouchList | TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getTouchCenter = (touches: React.TouchList | TouchList) => {
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    };
  };

  // Render canvas
  const render = React.useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y, scale } = currentRef.current;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    // Draw image
    ctx.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight);
    const selected = new Set(selectedRegionIdsRef.current);
    for (const region of hitRegionsRef.current ?? []) {
      if (!selected.has(region.id)) continue;
      ctx.fillStyle = 'rgba(6, 182, 212, 0.18)';
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 3 / scale;
      ctx.fillRect(region.x, region.y, region.width, region.height);
      ctx.strokeRect(region.x, region.y, region.width, region.height);
    }

    ctx.restore();
  }, []);

  React.useEffect(() => {
    hitRegionsRef.current = hitRegions;
    selectedRegionIdsRef.current = selectedRegionIds;
    onRegionClickRef.current = onRegionClick;
    render();
  }, [hitRegions, selectedRegionIds, onRegionClick, render]);

  // Mode 1: Snappy Update (Instant)
  // Used for drag, pinch, and wheel to ensure 1:1 input response
  const updateImmediate = React.useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    rafRef.current = requestAnimationFrame(() => {
      // Direct 1:1 sync with target
      currentRef.current.x = targetRef.current.x;
      currentRef.current.y = targetRef.current.y;
      currentRef.current.scale = targetRef.current.scale;

      render();

      const newPercent = Math.round(currentRef.current.scale * 100);
      setScalePercent((prev) => {
        if (prev !== newPercent) return newPercent;
        return prev;
      });

      rafRef.current = null;
    });
  }, [render]);

  // Mode 2: Smooth Update (Interpolated)
  // Used for buttons (zoom in/out, reset, center) to provide a nice feel
  const updateSmooth = React.useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const loop = () => {
      const target = targetRef.current;
      const current = currentRef.current;

      const lerp = 0.3; // Smoothing factor (higher = faster/snappier)
      const dist_x = target.x - current.x;
      const dist_y = target.y - current.y;
      const dist_s = target.scale - current.scale;

      // Stop condition: close enough to target
      if (Math.abs(dist_x) < 0.5 && Math.abs(dist_y) < 0.5 && Math.abs(dist_s) < 0.001) {
        current.x = target.x;
        current.y = target.y;
        current.scale = target.scale;
        render();
        setScalePercent(Math.round(current.scale * 100));
        rafRef.current = null;
        return;
      }

      // Interpolate
      current.x += dist_x * lerp;
      current.y += dist_y * lerp;
      current.scale += dist_s * lerp;

      render();
      setScalePercent(Math.round(current.scale * 100));
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
  }, [render]);

  // Clean up RAF on unmount
  React.useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  // Logic functions for API
  const applyZoom = React.useCallback(
    (delta: number) => {
      const target = targetRef.current;
      if (!viewportRef.current) return;
      const rect = viewportRef.current.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const newScale = Math.min(maxScale, Math.max(minScale, target.scale + delta));
      const ratio = newScale / target.scale;

      target.x = centerX - (centerX - target.x) * ratio;
      target.y = centerY - (centerY - target.y) * ratio;
      target.scale = newScale;
      isFitView.current = false;

      updateSmooth();
    },
    [maxScale, minScale, updateSmooth],
  );

  const zoomIn = React.useCallback(() => applyZoom(zoomStep), [applyZoom, zoomStep]);
  const zoomOut = React.useCallback(() => applyZoom(-zoomStep), [applyZoom, zoomStep]);

  const resetZoom = React.useCallback(() => {
    targetRef.current = { x: 0, y: 0, scale: initialScale };
    isFitView.current = false;
    updateSmooth();
  }, [initialScale, updateSmooth]);

  // Shared calculation for centering without applying it yet
  const getCenterTransform = React.useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return null;

    const scaleX = canvas.clientWidth / image.naturalWidth;
    const scaleY = canvas.clientHeight / image.naturalHeight;
    const scale = Math.min(scaleX, scaleY) * fitPadding;

    const x = (canvas.clientWidth - image.naturalWidth * scale) / 2;
    const y = (canvas.clientHeight - image.naturalHeight * scale) / 2;

    return { x, y, scale };
  }, [fitPadding]);

  const centerView = React.useCallback(() => {
    const center = getCenterTransform();
    if (!center) return;
    targetRef.current = center;
    isFitView.current = true;
    updateSmooth();
  }, [getCenterTransform, updateSmooth]);

  const api = React.useMemo(
    () => ({
      zoomIn,
      zoomOut,
      resetZoom,
      centerView,
      scalePercent,
    }),
    [zoomIn, zoomOut, resetZoom, centerView, scalePercent],
  );

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    isDragging.current = true;

    // Sync logic: grab exactly where we are, cancelling any smooth animation
    targetRef.current = { ...currentRef.current };
    panStartRef.current = { x: e.clientX, y: e.clientY };
    targetStartRef.current = { ...targetRef.current };

    updateImmediate();
  };

  const selectAt = React.useCallback((clientX: number, clientY: number, modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
    const canvas = canvasRef.current;
    if (!canvas || !onRegionClickRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const { x, y, scale } = currentRef.current;
    const imageX = (clientX - rect.left - x) / scale;
    const imageY = (clientY - rect.top - y) / scale;
    const region = [...(hitRegionsRef.current ?? [])].reverse().find((candidate) =>
      imageX >= candidate.x && imageX <= candidate.x + candidate.width &&
      imageY >= candidate.y && imageY <= candidate.y + candidate.height);
    if (region) onRegionClickRef.current(region.id, modifiers);
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    const panStep = event.shiftKey ? 80 : 32;
    switch (event.key) {
      case 'ArrowLeft':
        targetRef.current.x += panStep;
        break;
      case 'ArrowRight':
        targetRef.current.x -= panStep;
        break;
      case 'ArrowUp':
        targetRef.current.y += panStep;
        break;
      case 'ArrowDown':
        targetRef.current.y -= panStep;
        break;
      case '+':
      case '=':
        zoomIn();
        event.preventDefault();
        return;
      case '-':
        zoomOut();
        event.preventDefault();
        return;
      case '0':
        centerView();
        event.preventDefault();
        return;
      default:
        return;
    }
    event.preventDefault();
    updateImmediate();
  };

  // Setup non-passive wheel event listener
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      // #1549 G9 #27: only zoom when Ctrl/Meta is held -- also how browsers
      // report a trackpad pinch gesture as a wheel event -- so a plain wheel
      // (mouse scroll, or a trackpad pan) is left alone and scrolls the page
      // instead of being captured by the diagram underneath the cursor.
      if (wheelZoom === 'modifier' && !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      let delta = e.deltaY;
      if (e.deltaMode === 1) delta *= 40;
      const ZOOM_SENSITIVITY = 0.0015;
      const scaleFactor = Math.exp(-delta * ZOOM_SENSITIVITY);

      const current = currentRef.current;
      const target = targetRef.current;

      const effectiveScale = Math.min(maxScale, Math.max(minScale, current.scale * scaleFactor));
      const ratio = effectiveScale / current.scale;

      target.x = mouseX - (mouseX - current.x) * ratio;
      target.y = mouseY - (mouseY - current.y) * ratio;
      target.scale = effectiveScale;

      updateImmediate();
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [maxScale, minScale, updateImmediate, wheelZoom]);

  // Window events for dragging
  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      if (Math.hypot(dx, dy) >= 5) isFitView.current = false;

      targetRef.current.x = targetStartRef.current.x + dx;
      targetRef.current.y = targetStartRef.current.y + dy;

      updateImmediate();
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (isDragging.current && Math.hypot(event.clientX - panStartRef.current.x, event.clientY - panStartRef.current.y) < 5) {
        selectAt(event.clientX, event.clientY, event);
      }
      isDragging.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [selectAt, updateImmediate]);

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    // Sync current state to target to stop any smooth animation instantly
    targetRef.current = { ...currentRef.current };

    if (e.touches.length === 1) {
      isDragging.current = true;
      touchStartRef.current = {
        touches: [{ x: e.touches[0].clientX, y: e.touches[0].clientY }],
        translateX: currentRef.current.x,
        translateY: currentRef.current.y,
        scale: currentRef.current.scale,
        distance: 0,
        center: { x: 0, y: 0 },
      };
    } else if (e.touches.length === 2) {
      isPinching.current = true;
      isDragging.current = false;

      touchStartRef.current = {
        touches: [
          { x: e.touches[0].clientX, y: e.touches[0].clientY },
          { x: e.touches[1].clientX, y: e.touches[1].clientY },
        ],
        translateX: currentRef.current.x,
        translateY: currentRef.current.y,
        scale: currentRef.current.scale,
        distance: getTouchDistance(e.touches),
        center: getTouchCenter(e.touches),
      };
    }
    updateImmediate();
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.cancelable) e.preventDefault();
    if (!touchStartRef.current) return;

    if (e.touches.length === 1 && isDragging.current) {
      const dx = e.touches[0].clientX - touchStartRef.current.touches[0].x;
      const dy = e.touches[0].clientY - touchStartRef.current.touches[0].y;

      targetRef.current.x = touchStartRef.current.translateX + dx;
      targetRef.current.y = touchStartRef.current.translateY + dy;
    } else if (e.touches.length === 2) {
      const newDist = getTouchDistance(e.touches);
      const newCenter = getTouchCenter(e.touches);
      const rect = canvasRef.current?.getBoundingClientRect() || {
        left: 0,
        top: 0,
      };

      const scaleRatio = newDist / touchStartRef.current.distance;
      const newScale = Math.min(
        maxScale,
        Math.max(minScale, touchStartRef.current.scale * scaleRatio),
      );

      const oldScale = touchStartRef.current.scale;
      const oldX = touchStartRef.current.translateX;

      const oldCenterRelX = touchStartRef.current.center.x - rect.left;
      const oldCenterRelY = touchStartRef.current.center.y - rect.top;

      const contentX = (oldCenterRelX - oldX) / oldScale;
      const contentY = (oldCenterRelY - touchStartRef.current.translateY) / oldScale;

      const newCenterRelX = newCenter.x - rect.left;
      const newCenterRelY = newCenter.y - rect.top;

      targetRef.current.scale = newScale;
      targetRef.current.x = newCenterRelX - contentX * newScale;
      targetRef.current.y = newCenterRelY - contentY * newScale;
    }

    updateImmediate();
  };

  React.useEffect(() => {
    if (viewportMode !== 'image-aspect') return;
    const stage = stageRef.current;
    if (!stage) return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setStageDimensions((current) =>
        current?.width === width && current.height === height ? current : { width, height },
      );
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [viewportMode]);

  // Size the drawing canvas from its actual viewport, not from the controls and
  // stage around it. Image mode can therefore use a viewport matching the
  // source aspect ratio while diagram mode keeps filling the available panel.
  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      const { width, height } = entry.contentRect;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      // Preserve a fit-to-view presentation as the panel changes size. Once
      // the user zooms or pans, their chosen transform remains authoritative.
      if (
        imageRef.current &&
        width > 0 &&
        height > 0 &&
        (!hasCentered.current || isFitView.current)
      ) {
        const center = getCenterTransform();
        if (center) {
          targetRef.current = center;
          currentRef.current = center;
          hasCentered.current = true;
          setScalePercent(Math.round(center.scale * 100));
        }
      }

      render();
    });

    observer.observe(viewport);
    return () => observer.disconnect();
  }, [render, getCenterTransform]);

  // Image loading logic
  React.useEffect(() => {
    if (!imageSrc) {
      imageRef.current = null;
      hasCentered.current = false;
      isFitView.current = true;
      setImageDimensions(undefined);
      setImageError(undefined);
      render();
      return;
    }

    setImageError(undefined);
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      imageRef.current = image;
      setImageDimensions({ height: image.naturalHeight, width: image.naturalWidth });
      hasCentered.current = false;
      isFitView.current = true;

      // Fit each decoded image, including replacements with the same aspect
      // ratio (which don't trigger ResizeObserver). If the ratio changes,
      // ResizeObserver refits again after the new geometry is applied.
      {
        const center = getCenterTransform();
        if (center) {
          targetRef.current = center;
          currentRef.current = center;
          hasCentered.current = true;
          setScalePercent(Math.round(center.scale * 100));
        }
      }

      render();
      onLoad?.();
    };
    image.onerror = () => {
      const loadError = new Error('The image could not be decoded or loaded.');
      imageRef.current = null;
      setImageError(loadError.message);
      render();
      onError?.(loadError);
    };
    image.src = imageSrc;
  }, [imageSrc, onError, onLoad, render, getCenterTransform, viewportMode]);

  return (
    <div className={cn('flex h-full min-h-0 w-full flex-col', className)}>
      {/* oxlint-disable-next-line react/refs -- Passing callback APIs does not read their closed-over refs. */}
      {controls?.(api)}

      <div
        className={cn(
          'relative flex min-h-0 flex-1 items-center justify-center overflow-hidden',
          viewportMode === 'image-aspect' && 'p-3',
        )}
        ref={stageRef}
      >
        <div
          className={cn(
            'relative overflow-hidden cursor-grab active:cursor-grabbing touch-none select-none',
            viewportMode === 'fill' ? 'size-full' : 'shrink-0 max-h-full max-w-full shadow-sm',
            viewportClassName,
          )}
          ref={viewportRef}
          style={
            viewportDimensions
              ? { height: viewportDimensions.height, width: viewportDimensions.width }
              : undefined
          }
        >
          <canvas
            aria-label={ariaLabel}
            aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown + - 0"
            ref={canvasRef}
            onKeyDown={handleKeyDown}
            onMouseDown={handleMouseDown}
            // onWheel handled via useEffect with passive: false
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={(event) => {
              if (!isPinching.current && touchStartRef.current?.touches.length === 1 && event.changedTouches.length === 1) {
                const touch = event.changedTouches[0];
                if (Math.hypot(touch.clientX - touchStartRef.current.touches[0].x, touch.clientY - touchStartRef.current.touches[0].y) < 8) {
                  selectAt(touch.clientX, touch.clientY, { shiftKey: false, ctrlKey: false, metaKey: false });
                }
              }
              isDragging.current = false;
              isPinching.current = false;
            }}
            className="block size-full touch-none"
            role="img"
            tabIndex={0}
          />

          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-50 overflow-hidden opacity-0"
          >
            {children}
          </div>

          {isLoading && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/50">
              {loadingFallback || <Loader2 className="size-8 animate-spin text-muted-foreground" />}
            </div>
          )}
          {error || imageError ? (
            <div
              className="absolute inset-0 z-40 grid place-items-center bg-background/95 p-6 text-center"
              role="alert"
            >
              <div className="max-w-md">
                <AlertTriangleIcon aria-hidden="true" className="mx-auto size-5 text-destructive" />
                <p className="mt-2 text-sm font-medium">Preview unavailable</p>
                <p className="mt-1 text-xs text-muted-foreground">{error || imageError}</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface Dimensions {
  height: number;
  width: number;
}

/** Fits one aspect ratio inside another without cropping either dimension. */
export function fitAspectRatioViewport(stage: Dimensions, content: Dimensions): Dimensions {
  if (stage.width <= 0 || stage.height <= 0 || content.width <= 0 || content.height <= 0) {
    return { height: 0, width: 0 };
  }
  const scale = Math.min(stage.width / content.width, stage.height / content.height);
  return { height: content.height * scale, width: content.width * scale };
}
