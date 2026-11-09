'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MermaidConfig } from './mermaid';
import { Mermaid } from './mermaid';
import { ZoomPan } from './zoom-pan';
import { sanitizeMermaidSvg } from '@/components/clio/mermaid-security';
import { StateView } from '@/components/clio/primitives/state-view';
import { cn } from '@/lib/utils';
import { mermaidNodeRegions } from './mermaid-node-regions';
import { mermaidSelectableText } from './mermaid-selectable-text';

export interface MermaidPreviewProps {
  chart: string;
  config: MermaidConfig;
  svgOutput: string;
  onSvgOutputChange: (svg: string) => void;
  className?: string;
  autoHeight?: boolean;
  controls: (api: {
    zoomIn: () => void;
    zoomOut: () => void;
    centerView: () => void;
    scalePercent: number;
  }) => ReactNode;
  interactiveNodes?: readonly { id: string; label: string }[];
  selectedNodeIds?: readonly string[];
  onNodeClick?: (
    id: string,
    modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
  ) => void;
}

/** Diagram canvas using the same header controls as other CLIO surfaces. */
export function MermaidPreview({
  chart,
  config,
  svgOutput,
  onSvgOutputChange,
  className,
  autoHeight = false,
  controls,
  interactiveNodes,
  selectedNodeIds,
  onNodeClick,
}: MermaidPreviewProps) {
  const [renderError, setRenderError] = useState<string>();
  const hostRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const [controlsHeight, setControlsHeight] = useState(40);
  const [availableWidth, setAvailableWidth] = useState<number>();
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => {
      if (host.clientWidth > 0) setAvailableWidth(host.clientWidth);
      const height = controlsRef.current?.getBoundingClientRect().height;
      if (height) setControlsHeight(height);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    if (controlsRef.current) observer.observe(controlsRef.current);
    return () => observer.disconnect();
  }, []);
  const responsiveConfig = useMemo(
    () => ({ ...config, maxWidth: availableWidth }),
    [config, availableWidth],
  );
  const dimensions = svgDimensions(svgOutput);
  const height = autoHeight
    ? Math.max(
        96,
        Math.min(
          600,
          availableWidth && dimensions
            ? Math.min(1, availableWidth / dimensions.width) * dimensions.height
            : 208,
        ),
      ) + controlsHeight
    : undefined;
  const imageSrc = useMemo(
    () =>
      svgOutput
        ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgWithIntrinsicSize(svgOutput))}`
        : '',
    [svgOutput],
  );
  const hitRegions = useMemo(
    () => (interactiveNodes ? mermaidNodeRegions(svgOutput, interactiveNodes) : []),
    [svgOutput, interactiveNodes],
  );
  const textLayer = useMemo(() => mermaidSelectableText(svgOutput), [svgOutput]);

  return (
    <div ref={hostRef} className={cn('min-w-0', className)} style={height ? { height } : undefined}>
      <ZoomPan
        ariaLabel="Interactive Mermaid diagram"
        className="h-full min-h-0"
        controls={(api) => (
          <div ref={controlsRef} className="flow-root shrink-0">
            {controls(api)}
          </div>
        )}
        error={renderError}
        // Pele and the theme fonts load lazily; say so rather than show an empty body.
        isLoading={!svgOutput && !renderError && chart.trim() !== ''}
        loadingFallback={<StateView kind="loading" size="viewer" title="Loading diagram" />}
        fitPadding={0.94}
        imageSrc={imageSrc}
        selectableTextSvg={textLayer}
        hitRegions={hitRegions}
        selectedRegionIds={selectedNodeIds}
        onRegionClick={onNodeClick}
        wheelZoom="plain"
      >
        <Mermaid
          chart={chart}
          className="size-full"
          config={responsiveConfig}
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
              setRenderError(
                error instanceof Error ? error.message : 'The diagram could not be rendered.',
              );
            }
          }}
        />
      </ZoomPan>
    </div>
  );
}

function svgDimensions(svg: string): { width: number; height: number } | null {
  const viewBox = svg.match(/<svg\b[^>]*\bviewBox="([^"]+)"/u)?.[1];
  const values = viewBox?.trim().split(/\s+/u).map(Number);
  if (values?.length !== 4 || !values.every(Number.isFinite) || values[2] <= 0 || values[3] <= 0)
    return null;
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
  const sizedRoot = root
    .replace(/\swidth="[^"]*"/u, ` width="${dimensions.width}"`)
    .replace(/\sheight="[^"]*"/u, '');
  return `${prefix}${sizedRoot} height="${dimensions.height}"${body}`;
}
