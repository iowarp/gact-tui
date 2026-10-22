import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FlowDiagramSpec } from '@/hooks/use-flow-presentation';
import { cn } from '@/lib/utils';
import { renderPeleDiagram } from './diagram-renderer';
import { markRailroad, scaleSvg } from './flow-railroad-marks';

/** Widths are measured in steps of this size so a resize does not redraw on every pixel. */
const WIDTH_STEP = 40;

/**
 * A flow drawn by Pele: the railroad, or the plan graph with the visible
 * reason it is not a railroad. Each node's label carries its state in words;
 * the `st-*` classes (index.css) add colour, and a running step's outline
 * moves unless the person prefers reduced motion. The palette follows the
 * page's theme variables, so a theme change needs no redraw. The source is
 * redrawn whenever the run changes, so steps an editor adds appear in place.
 */
export function FlowDiagram({
  spec,
  fontSize = 13,
  scale = 1,
  className,
}: {
  spec: FlowDiagramSpec;
  fontSize?: number;
  /** Draw larger than natural size, up to the available width (full screen). */
  scale?: number;
  className?: string;
}) {
  const id = useId().replaceAll(':', '');
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const source = spec.kind === 'railroad' ? spec.railroad.source : spec.source;
  const railroad = spec.kind === 'railroad' ? spec.railroad : undefined;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = (next: number) =>
      setWidth(Math.max(WIDTH_STEP * 6, Math.floor(next / WIDTH_STEP) * WIDTH_STEP));
    update(element.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) update(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!width) return;
    let cancelled = false;
    renderPeleDiagram(source, `flow-${id}`, Math.floor(width / scale), {
      fontSize,
      autoDirection: !railroad,
      inheritTheme: true,
      transform: (element) => {
        element.removeAttribute('role');
        if (railroad) markRailroad(element, railroad);
        if (scale !== 1) scaleSvg(element, scale, width);
      },
    })
      .then((html) => {
        if (cancelled) return;
        if (html) {
          setSvg(html);
          setFailed(false);
        } else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [fontSize, id, railroad, scale, source, width]);

  const html = useMemo(() => ({ __html: svg ?? '' }), [svg]);
  return (
    <figure className={cn('m-0 grid min-w-0 gap-1.5', className)}>
      <div
        aria-label={spec.label}
        className={cn('clio-flow-diagram min-w-0', railroad ? 'min-h-10' : 'min-h-24')}
        ref={ref}
        role="img"
      >
        {failed && !svg ? (
          <p className="py-2 text-xs text-muted-foreground">
            The diagram could not be drawn; the steps below carry the same facts.
          </p>
        ) : (
          <div aria-hidden="true" dangerouslySetInnerHTML={html} />
        )}
      </div>
      {spec.kind === 'graph' ? (
        <figcaption className="text-xs text-muted-foreground">{spec.note}</figcaption>
      ) : null}
    </figure>
  );
}
