import { useEffect, useId, useMemo, useState } from 'react';
import { renderPeleDiagram } from './diagram-renderer';
import { parseDiagramSource } from './mermaid-security';

type ShapeState = { kind: 'drawing' } | { kind: 'drawn'; svg: string } | { kind: 'failed' };

/** A finished drawing, kept with the source it drew so a new source reads as drawing. */
type Drawing = { source: string; state: ShapeState };

/**
 * A flow's shape as its author drew it (railroad-beta), drawn by Pele at its
 * natural size. A wide drawing scrolls sideways inside its own box instead of
 * shrinking past legibility or widening the page. No drawing, or one that
 * does not draw, is said in words; a failed one shows its source.
 */
export function PluginFlowShape({ source, label }: { source: string; label: string }) {
  const id = useId().replaceAll(':', '');
  const shape = source.trim();
  // A plugin's drawing passes the same source checks as any diagram the agent sends.
  const checked = useMemo(() => {
    try {
      return shape ? parseDiagramSource(shape).source : '';
    } catch {
      return undefined;
    }
  }, [shape]);
  const [drawing, setDrawing] = useState<Drawing>();
  const state: ShapeState =
    checked === undefined
      ? { kind: 'failed' }
      : drawing?.source === shape
        ? drawing.state
        : { kind: 'drawing' };

  useEffect(() => {
    if (!checked) return;
    let cancelled = false;
    renderPeleDiagram(checked, `plugin-shape-${id}`, undefined, {
      fontSize: 13,
      inheritTheme: true,
      transform: (element) => {
        element.removeAttribute('role');
        // Pele fits its drawing to the box; here the box scrolls instead.
        element.style.maxWidth = 'none';
      },
    })
      .then((svg) => {
        if (!cancelled)
          setDrawing({ source: shape, state: svg ? { kind: 'drawn', svg } : { kind: 'failed' } });
      })
      .catch(() => {
        if (!cancelled) setDrawing({ source: shape, state: { kind: 'failed' } });
      });
    return () => {
      cancelled = true;
    };
  }, [checked, id, shape]);

  const svg = state.kind === 'drawn' ? state.svg : '';
  const html = useMemo(() => ({ __html: svg }), [svg]);
  if (!shape) {
    return (
      <p className="text-xs text-muted-foreground" data-slot="plugin-flow-shape-missing">
        No diagram was drawn for this flow.
      </p>
    );
  }
  if (state.kind === 'failed') {
    return (
      <div className="grid min-w-0 gap-1" data-slot="plugin-flow-shape-failed">
        <p className="text-xs text-muted-foreground">
          This flow&apos;s diagram could not be drawn. Here is how it was written:
        </p>
        <pre className="clio-scrollbar max-h-40 overflow-auto rounded-md bg-muted/60 p-2 font-mono text-xs whitespace-pre">
          {shape}
        </pre>
      </div>
    );
  }
  return (
    <div
      aria-busy={state.kind === 'drawing'}
      aria-label={`Steps of ${label}`}
      className="clio-flow-diagram clio-scrollbar min-h-10 min-w-0 overflow-x-auto rounded-md border border-border/60 bg-background/60 p-2"
      data-slot="plugin-flow-shape"
      role="img"
    >
      {state.kind === 'drawing' ? (
        <p className="text-xs text-muted-foreground">Drawing the diagram…</p>
      ) : (
        <div aria-hidden="true" className="w-max" dangerouslySetInnerHTML={html} />
      )}
    </div>
  );
}
