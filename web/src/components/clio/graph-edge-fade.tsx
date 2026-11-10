import { useStore } from '@xyflow/react';
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const EDGE = 'pointer-events-none absolute z-[4] from-background to-transparent';
const CUE = 'absolute size-4 text-muted-foreground';
const INSET = 20;

const clamp = (value: number, max: number) => Math.min(Math.max(value, INSET), max - INSET);

/**
 * "More this way": a fade and chevron on each pane edge the drawing continues past, so
 * a graph opened at its readable scale shows it can be panned. The chevron sits level
 * with the visible middle of the drawing. Mount inside a `ReactFlow`; `width` and
 * `height` are the drawing's extent from 0, 0 in graph units.
 */
export function GraphEdgeFade({ width, height }: { width: number; height: number }) {
  const x = useStore((state) => state.transform[0]);
  const y = useStore((state) => state.transform[1]);
  const zoom = useStore((state) => state.transform[2]);
  const paneWidth = useStore((state) => state.width);
  const paneHeight = useStore((state) => state.height);
  if (!paneWidth || !paneHeight || !width || !height) return null;
  const left = x < -1;
  const top = y < -1;
  const right = x + width * zoom > paneWidth + 1;
  const bottom = y + height * zoom > paneHeight + 1;
  const level = {
    top: clamp((Math.max(y, 0) + Math.min(y + height * zoom, paneHeight)) / 2, paneHeight),
  };
  const across = {
    left: clamp((Math.max(x, 0) + Math.min(x + width * zoom, paneWidth)) / 2, paneWidth),
  };
  return (
    <>
      {left ? (
        <div
          aria-hidden
          data-graph-more="left"
          className={cn(EDGE, 'inset-y-0 left-0 w-10 bg-linear-to-r')}
        >
          <ChevronLeftIcon className={cn(CUE, 'left-1 -translate-y-1/2')} style={level} />
        </div>
      ) : null}
      {right ? (
        <div
          aria-hidden
          data-graph-more="right"
          className={cn(EDGE, 'inset-y-0 right-0 w-10 bg-linear-to-l')}
        >
          <ChevronRightIcon className={cn(CUE, 'right-1 -translate-y-1/2')} style={level} />
        </div>
      ) : null}
      {top ? (
        <div
          aria-hidden
          data-graph-more="top"
          className={cn(EDGE, 'inset-x-0 top-0 h-10 bg-linear-to-b')}
        >
          <ChevronUpIcon className={cn(CUE, 'top-1 -translate-x-1/2')} style={across} />
        </div>
      ) : null}
      {bottom ? (
        <div
          aria-hidden
          data-graph-more="bottom"
          className={cn(EDGE, 'inset-x-0 bottom-0 h-10 bg-linear-to-t')}
        >
          <ChevronDownIcon className={cn(CUE, 'bottom-1 -translate-x-1/2')} style={across} />
        </div>
      ) : null}
    </>
  );
}
