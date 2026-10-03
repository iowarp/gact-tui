'use client';

import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import type { MermaidConfig } from './mermaid';
import { Mermaid } from './mermaid';
import { ZoomPan } from './zoom-pan';
import { sanitizeMermaidSvg } from '@/components/clio/mermaid-security';
import { cn } from '@/lib/utils';

export interface MermaidPreviewProps {
  chart: string;
  config: MermaidConfig;
  svgOutput: string;
  onSvgOutputChange: (svg: string) => void;
  className?: string;
  controls: (api: { zoomIn: () => void; zoomOut: () => void; centerView: () => void; scalePercent: number }) => ReactNode;
}

/** Diagram canvas using the same header controls as other CLIO surfaces. */
export function MermaidPreview({ chart, config, svgOutput, onSvgOutputChange, className, controls }: MermaidPreviewProps) {
  const [renderError, setRenderError] = useState<string>();
  const imageSrc = useMemo(() => svgOutput
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgWithIntrinsicSize(svgOutput))}`
    : '', [svgOutput]);

  return <ZoomPan
    ariaLabel="Interactive Mermaid diagram"
    className={cn('min-h-0', className)}
    controls={controls}
    error={renderError}
    fitPadding={0.8}
    imageSrc={imageSrc}
    wheelZoom="plain"
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
          setRenderError(error instanceof Error ? error.message : 'The diagram could not be rendered.');
        }
      }}
    />
  </ZoomPan>;
}

function svgDimensions(svg: string): { width: number; height: number } | null {
  const viewBox = svg.match(/<svg\b[^>]*\bviewBox="([^"]+)"/u)?.[1];
  const values = viewBox?.trim().split(/\s+/u).map(Number);
  if (values?.length !== 4 || !values.every(Number.isFinite) || values[2] <= 0 || values[3] <= 0) return null;
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
  const sizedRoot = root.replace(/\swidth="[^"]*"/u, ` width="${dimensions.width}"`).replace(/\sheight="[^"]*"/u, '');
  return `${prefix}${sizedRoot} height="${dimensions.height}"${body}`;
}
