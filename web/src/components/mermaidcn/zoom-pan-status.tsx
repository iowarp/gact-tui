import type * as React from 'react';
import { AlertTriangleIcon, Loader2 } from 'lucide-react';
import { t } from '@lingui/core/macro';

interface ZoomPanStatusLayerProps {
  isLoading: boolean;
  loadingFallback?: React.ReactNode;
  error?: string;
}

/**
 * What the canvas shows instead of the drawing while it loads or after it
 * fails. A caller-supplied loading fallback covers the canvas opaquely so a
 * half-painted first frame never shows through.
 */
export function ZoomPanStatusLayer({ isLoading, loadingFallback, error }: ZoomPanStatusLayerProps) {
  return (
    <>
      {isLoading ? (
        loadingFallback ? (
          <div className="absolute inset-0 z-50 bg-background">{loadingFallback}</div>
        ) : (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/50">
            <Loader2 className="size-8 motion-safe:animate-spin text-muted-foreground" />
          </div>
        )
      ) : null}
      {error ? (
        <div
          className="absolute inset-0 z-40 grid place-items-center bg-background/95 p-6 text-center"
          role="alert"
        >
          <div className="max-w-md">
            <AlertTriangleIcon aria-hidden="true" className="mx-auto size-5 text-destructive" />
            <p className="mt-2 text-sm font-medium">{t`Preview unavailable`}</p>
            <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
