import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import type { FlowDiagramSpec } from '@/hooks/use-flow-presentation';
import { cn } from '@/lib/utils';
import { renderPeleDiagram } from './diagram-renderer';
import { markRailroad, scaleSvg } from './flow-railroad-marks';

/** Widths are measured in steps of this size so a resize does not redraw on every pixel. */
const WIDTH_STEP = 40;

/**
 * A flow drawn by Pele: the railroad, or the workflow graph with the visible
 * reason it is not a railroad. A railroad node's label is its name; the
 * `st-*` classes (index.css) colour it by state, a running step's outline
 * moves unless the person prefers reduced motion, and its tooltip and
 * accessible name say the state in words. With `onSelect`, each node is a
 * button that selects it. The palette follows the page's theme variables, so
 * a theme change needs no redraw. The source is redrawn whenever the run
 * changes, so steps an editor adds appear in place.
 */
export function FlowDiagram({
  spec,
  fontSize = 13,
  scale = 1,
  className,
  selected,
  onSelect,
}: {
  spec: FlowDiagramSpec;
  fontSize?: number;
  /** Draw larger than natural size, up to the available width (full screen). */
  scale?: number;
  className?: string;
  /** The key of the selected node. */
  selected?: string;
  /** Called with a node's key when the person selects it; again to clear it. */
  onSelect?: (key: string) => void;
}) {
  const id = useId().replaceAll(':', '');
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const source = spec.kind === 'railroad' ? spec.railroad.source : spec.source;
  const railroad = spec.kind === 'railroad' ? spec.railroad : undefined;
  const selectable = Boolean(railroad && onSelect);

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
    // A railroad is drawn at its natural width, never wrapped onto a second line (a wrapped
    // track crosses itself); a narrow screen scrolls it sideways. A graph fits the width.
    renderPeleDiagram(source, `flow-${id}`, railroad ? undefined : Math.floor(width / scale), {
      fontSize,
      autoDirection: !railroad,
      inheritTheme: true,
      transform: (element) => {
        element.removeAttribute('role');
        if (railroad) {
          element.style.maxWidth = 'none';
          markRailroad(element, railroad, selectable);
        }
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
  }, [fontSize, id, railroad, scale, selectable, source, width]);

  // The selection is a class on the drawn node, so selecting never redraws.
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    for (const node of element.querySelectorAll('[data-key]')) {
      const on = node.getAttribute('data-key') === selected;
      node.classList.toggle('is-selected', on);
      if (selectable) node.setAttribute('aria-pressed', String(on));
    }
  }, [selectable, selected, svg]);

  const pick = (event: MouseEvent | KeyboardEvent) => {
    const node = (event.target as Element).closest?.('[data-key]');
    const key = node?.getAttribute('data-key');
    if (!key || !onSelect) return;
    event.preventDefault();
    onSelect(key);
  };
  const html = useMemo(() => ({ __html: svg ?? '' }), [svg]);
  return (
    <figure className={cn('m-0 grid min-w-0 gap-1.5', className)}>
      {/* Keyboard selection is on each node (a focusable button); the wrapper only delegates. */}
      {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        aria-label={spec.label}
        className={cn(
          'clio-flow-diagram min-w-0',
          railroad ? 'clio-scrollbar min-h-10 overflow-x-auto' : 'min-h-24',
          selectable && 'is-selectable',
        )}
        onClick={selectable ? pick : undefined}
        onKeyDown={
          selectable
            ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') pick(event);
              }
            : undefined
        }
        ref={ref}
        role={selectable ? 'group' : 'img'}
      >
        {failed && !svg ? (
          <p className="py-2 text-xs text-muted-foreground">
            The diagram could not be drawn; the workflow below carries the same steps.
          </p>
        ) : (
          <div aria-hidden={selectable ? undefined : true} dangerouslySetInnerHTML={html} />
        )}
      </div>
      {spec.kind === 'graph' ? (
        <figcaption className="text-xs text-muted-foreground">{spec.note}</figcaption>
      ) : null}
    </figure>
  );
}
