import {
  ControlButton,
  Controls,
  useReactFlow,
  type FitViewOptions,
  type Viewport,
} from '@xyflow/react';
import { Maximize, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, type RefObject } from 'react';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { eventKey } from '@/lib/shortcuts/keys';

/**
 * The spec's zoom row for a node graph: zoom in, zoom out and fit, each named on
 * hover, in the pane's bottom-right corner. + − 0 do the same while focus is in
 * `region`. Mount inside a `ReactFlow`. `fitTo` may name the fitted viewport
 * itself; when it returns nothing, Fit frames the whole drawing with `fit`.
 */
export function GraphControls({
  label,
  region,
  fit,
  fitTo,
}: {
  label: string;
  region: RefObject<Element | null>;
  fit?: FitViewOptions;
  fitTo?: () => Viewport | undefined;
}) {
  return (
    <>
      <Controls
        aria-label={label}
        className="!m-3 !gap-0.5 !border-0 !bg-transparent !shadow-none [&_button]:!size-7 [&_button]:!rounded-md [&_button]:!border-0 [&_button]:!bg-transparent [&_button]:!text-muted-foreground [&_button:hover]:!bg-hover [&_button:hover]:!text-foreground [&_button:focus-visible]:!text-foreground [&_button:focus-visible]:!outline-none [&_button:focus-visible]:!ring-2 [&_button:focus-visible]:!ring-ring [&_svg]:!size-3.5 [&_svg]:!max-h-none [&_svg]:!max-w-none [&_svg]:!fill-none"
        orientation="horizontal"
        position="bottom-right"
        showFitView={false}
        showInteractive={false}
        showZoom={false}
      >
        <GraphZoomButtons fit={fit} fitTo={fitTo} />
      </Controls>
      <GraphZoomKeys region={region} fit={fit} fitTo={fitTo} />
    </>
  );
}

type FitTarget = { fit?: FitViewOptions; fitTo?: () => Viewport | undefined };

function useFit({ fit, fitTo }: FitTarget) {
  const { fitView, setViewport } = useReactFlow();
  return () => {
    const to = fitTo?.();
    void (to ? setViewport(to, { duration: fit?.duration }) : fitView(fit));
  };
}

function GraphZoomButtons(target: FitTarget) {
  const { zoomIn, zoomOut } = useReactFlow();
  const fitView = useFit(target);
  return (
    <>
      <ControlButton aria-label="Zoom in" onClick={() => void zoomIn()} title="Zoom in">
        <ZoomIn aria-hidden />
      </ControlButton>
      <ControlButton aria-label="Zoom out" onClick={() => void zoomOut()} title="Zoom out">
        <ZoomOut aria-hidden />
      </ControlButton>
      <ControlButton aria-label="Fit view" onClick={fitView} title="Fit view">
        <Maximize aria-hidden />
      </ControlButton>
    </>
  );
}

/** + − 0 zoom in, out and fit while focus is in the graph (a node or a control). */
function GraphZoomKeys({ region, ...target }: FitTarget & { region: RefObject<Element | null> }) {
  const { zoomIn, zoomOut } = useReactFlow();
  const fitView = useFit(target);
  useShortcut('graph-zoom', (event) => void (eventKey(event) === '-' ? zoomOut() : zoomIn()), {
    region,
  });
  useShortcut('graph-fit', fitView, { region });
  return null;
}

/** Re-anchor when the pane's fit changes; selection and dragging keep the reader's zoom and pan. */
export function ApplyViewport({ viewport }: { viewport: Viewport }) {
  const { setViewport } = useReactFlow();
  const { x, y, zoom } = viewport;
  useEffect(() => {
    void setViewport({ x, y, zoom });
  }, [setViewport, x, y, zoom]);
  return null;
}
