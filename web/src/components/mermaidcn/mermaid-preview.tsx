'use client';

import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  LocateFixedIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/utils';
import { sanitizeMermaidSvg } from '@/components/clio/mermaid-security';
import { Mermaid, type MermaidConfig } from './mermaid';
import { ZoomPan } from './zoom-pan';

export interface MermaidPreviewProps {
  chart: string;
  config: MermaidConfig;
  svgOutput: string;
  onSvgOutputChange: (svg: string) => void;
  className?: string;
}

/** MermaidCN's export-capable, auto-fit canvas preview. */
export function MermaidPreview({
  chart,
  config,
  svgOutput,
  onSvgOutputChange,
  className,
}: MermaidPreviewProps) {
  const [copied, setCopied] = React.useState(false);
  const [renderError, setRenderError] = React.useState<string>();
  const copiedTimerRef = React.useRef<number | undefined>(undefined);
  const imageSrc = React.useMemo(
    () =>
      svgOutput
        ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgWithIntrinsicSize(svgOutput))}`
        : '',
    [svgOutput],
  );

  React.useEffect(
    () => () => {
      if (copiedTimerRef.current !== undefined) window.clearTimeout(copiedTimerRef.current);
    },
    [],
  );

  const copySvg = React.useCallback(async () => {
    if (!svgOutput) return;
    try {
      await copyText(svgOutput);
      setCopied(true);
      toast.success('Diagram SVG copied');
      if (copiedTimerRef.current !== undefined) window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      toast.error('Could not copy the diagram', { description: errorMessage(error) });
    }
  }, [svgOutput]);

  const exportSvg = React.useCallback(() => {
    if (!svgOutput) return;
    try {
      downloadBlob(
        new Blob([svgWithIntrinsicSize(svgOutput)], { type: 'image/svg+xml;charset=utf-8' }),
        'mermaid-diagram.svg',
      );
      toast.success('SVG download started');
    } catch (error) {
      toast.error('Could not download the SVG', { description: errorMessage(error) });
    }
  }, [svgOutput]);

  const exportPng = React.useCallback(async () => {
    if (!svgOutput) return;
    try {
      const dimensions = svgDimensions(svgOutput);
      if (!dimensions) throw new Error('The diagram did not provide usable export dimensions.');

      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(dimensions.width * scale));
      canvas.height = Math.max(1, Math.round(dimensions.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('This browser could not create an image canvas.');
      context.fillStyle = '#001118';
      context.fillRect(0, 0, canvas.width, canvas.height);

      const { Canvg } = await import('canvg');
      const renderer = Canvg.fromString(context, svgWithIntrinsicSize(svgOutput));
      await renderer.render({
        ignoreAnimation: true,
        ignoreClear: true,
        ignoreDimensions: true,
        ignoreMouse: true,
        scaleHeight: canvas.height,
        scaleWidth: canvas.width,
      });
      const blob = await canvasBlob(canvas, 'image/png');
      downloadBlob(blob, 'mermaid-diagram.png');
      toast.success('PNG download started');
    } catch (error) {
      toast.error('Could not create the PNG', { description: errorMessage(error) });
    }
  }, [svgOutput]);

  return (
    <ZoomPan
      ariaLabel="Interactive Mermaid diagram"
      className={cn('min-h-0', className)}
      error={renderError}
      imageSrc={imageSrc}
      controls={({ zoomIn, zoomOut, resetZoom, centerView, scalePercent }) => (
        <div className="flex min-h-9 items-center justify-between gap-2 border-b px-2 py-1">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Scroll to zoom, drag to pan
          </span>
          <div className="ml-auto flex items-center gap-0.5">
            <Button
              aria-label="Zoom out"
              className="size-7"
              disabled={!svgOutput}
              onClick={zoomOut}
              size="icon"
              title="Zoom out"
              variant="ghost"
            >
              <ZoomOutIcon aria-hidden="true" className="size-3.5" />
            </Button>
            <button
              aria-label="Reset zoom"
              className="min-w-12 px-1 text-center text-[11px] font-medium tabular-nums text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              disabled={!svgOutput}
              onClick={resetZoom}
              title="Reset zoom"
              type="button"
            >
              {scalePercent}%
            </button>
            <Button
              aria-label="Zoom in"
              className="size-7"
              disabled={!svgOutput}
              onClick={zoomIn}
              size="icon"
              title="Zoom in"
              variant="ghost"
            >
              <ZoomInIcon aria-hidden="true" className="size-3.5" />
            </Button>
            <Button
              aria-label="Fit diagram to view"
              className="size-7"
              disabled={!svgOutput}
              onClick={centerView}
              size="icon"
              title="Fit diagram to view"
              variant="ghost"
            >
              <LocateFixedIcon aria-hidden="true" className="size-3.5" />
            </Button>
            <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
            <Button
              aria-label="Copy diagram as SVG"
              className="size-7"
              disabled={!svgOutput}
              onClick={() => void copySvg()}
              size="icon"
              title="Copy diagram as SVG"
              variant="ghost"
            >
              {copied ? (
                <CheckIcon aria-hidden="true" className="size-3.5 text-success" />
              ) : (
                <CopyIcon aria-hidden="true" className="size-3.5" />
              )}
            </Button>
            <Button
              aria-label="Download diagram as SVG"
              className="size-7"
              disabled={!svgOutput}
              onClick={exportSvg}
              size="icon"
              title="Download diagram as SVG"
              variant="ghost"
            >
              <DownloadIcon aria-hidden="true" className="size-3.5" />
            </Button>
            <Button
              aria-label="Download diagram as PNG"
              className="h-7 px-2 text-[11px]"
              disabled={!svgOutput}
              onClick={() => void exportPng()}
              size="sm"
              title="Download diagram as PNG"
              variant="ghost"
            >
              PNG
            </Button>
          </div>
        </div>
      )}
    >
      <Mermaid
        chart={chart}
        className="size-full"
        config={config}
        debounceTime={0}
        onError={(error) => {
          onSvgOutputChange('');
          setRenderError(error.split('\n')[0] || 'The diagram could not be rendered.');
        }}
        onSuccess={(svg) => {
          try {
            const sanitized = sanitizeMermaidSvg(svg);
            onSvgOutputChange(new XMLSerializer().serializeToString(sanitized));
            setRenderError(undefined);
          } catch (error) {
            onSvgOutputChange('');
            setRenderError(errorMessage(error));
          }
        }}
      />
    </ZoomPan>
  );
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.download = filename;
  anchor.href = url;
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected browser error occurred.';
}

function canvasBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('The browser did not produce an image file.'));
    }, type);
  });
}

function svgDimensions(svg: string): { width: number; height: number } | null {
  const viewBox = svg.match(/<svg\b[^>]*\bviewBox="([^"]+)"/u)?.[1];
  const values = viewBox?.trim().split(/\s+/u).map(Number);
  if (values?.length !== 4 || !values.every(Number.isFinite) || values[2] <= 0 || values[3] <= 0) {
    return null;
  }
  return { width: values[2], height: values[3] };
}

function svgWithIntrinsicSize(svg: string): string {
  const dimensions = svgDimensions(svg);
  if (!dimensions) return svg;
  const rootStart = svg.indexOf('<svg');
  const rootEnd = svg.indexOf('>', rootStart);
  if (rootStart < 0 || rootEnd < 0) return svg;
  const prefix = svg.slice(0, rootStart);
  const root = svg.slice(rootStart, rootEnd);
  const body = svg.slice(rootEnd);
  const width = String(dimensions.width);
  const height = String(dimensions.height);
  const sizedRoot = root
    .replace(/\swidth="[^"]*"/u, ` width="${width}"`)
    .replace(/\sheight="[^"]*"/u, '');
  return `${prefix}${sizedRoot} height="${height}"${body}`;
}
