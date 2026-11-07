import type { DocumentAnchor } from '@clio/core/v3';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { svgSelector } from '@/lib/svg-selector';

/** Attributes that would run code or leave the page from an inline copy of an SVG. */
const UNSAFE_ATTRIBUTE = /^on/iu;
const UNSAFE_URL = /^\s*javascript:/iu;

/**
 * A copy of an SVG for picking its elements: the same markup, with event handlers and
 * `javascript:` links removed. Scripts never run from markup assigned this way, and
 * nothing is removed but those attributes, so element positions (and with them the
 * selectors the server resolves on the original file) stay the same.
 */
function pickableSvg(markup: string): SVGSVGElement | undefined {
  const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const root = parsed.documentElement;
  if (root.nodeName.toLowerCase() !== 'svg' || parsed.querySelector('parsererror'))
    return undefined;
  for (const element of [root, ...root.querySelectorAll('*')]) {
    for (const attribute of [...element.attributes]) {
      if (
        UNSAFE_ATTRIBUTE.test(attribute.name) ||
        (/href$/iu.test(attribute.name) && UNSAFE_URL.test(attribute.value))
      )
        element.removeAttribute(attribute.name);
    }
  }
  return root as unknown as SVGSVGElement;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Element marks on an SVG shown as an image (ledger FB21). The SVG is laid over the image,
 * the same size, inside a shadow root so its styles stay its own; hovering outlines the
 * element under the pointer and a click makes a `dom` mark: its selector in the SVG, tag,
 * text and markup, and its box normalized to the image.
 */
export function SvgElementLayer({
  bytes,
  host,
  htmlChars = 400,
  onPick,
}: {
  bytes: Uint8Array;
  host: HTMLElement;
  htmlChars?: number;
  onPick: (anchor: DocumentAnchor, box: DOMRect) => void;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<CSSProperties>();
  const [outline, setOutline] = useState<CSSProperties>();

  useEffect(() => {
    const image = host.querySelector('img');
    if (!image) return;
    const update = () => {
      const outer = host.getBoundingClientRect();
      const box = image.getBoundingClientRect();
      setPlace({
        left: box.left - outer.left,
        top: box.top - outer.top,
        width: box.width,
        height: box.height,
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(image);
    window.addEventListener('scroll', update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', update, true);
    };
  }, [host]);

  useEffect(() => {
    const element = layer.current;
    if (!element || !place) return;
    const svg = pickableSvg(new TextDecoder().decode(bytes));
    if (!svg) return;
    const shadow = element.shadowRoot ?? element.attachShadow({ mode: 'open' });
    shadow.replaceChildren();
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    if (!svg.getAttribute('preserveAspectRatio'))
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.style.display = 'block';
    svg.style.opacity = '0'; // the image underneath is what the person sees
    svg.style.cursor = 'crosshair';
    shadow.append(document.importNode(svg, true));
    const root = shadow.querySelector('svg')!;
    const target = (event: Event) =>
      event.target instanceof Element && event.target !== root && root.contains(event.target)
        ? event.target
        : undefined;
    const hover = (event: Event) => {
      const picked = target(event);
      const outer = element.getBoundingClientRect();
      if (!picked) return setOutline(undefined);
      const box = picked.getBoundingClientRect();
      setOutline({
        left: box.left - outer.left,
        top: box.top - outer.top,
        width: box.width,
        height: box.height,
      });
    };
    const click = (event: Event) => {
      const picked = target(event);
      if (!picked) return;
      event.preventDefault();
      event.stopPropagation();
      const outer = element.getBoundingClientRect();
      const box = picked.getBoundingClientRect();
      onPick(
        {
          profile: 'dom',
          selector: svgSelector(picked, root),
          tag: picked.tagName.toLowerCase(),
          text_excerpt:
            (picked.textContent || '').replace(/\s+/gu, ' ').trim().slice(0, 4000) || undefined,
          html_excerpt: picked.outerHTML.slice(0, htmlChars),
          rect: [
            clamp((box.left - outer.left) / outer.width),
            clamp((box.top - outer.top) / outer.height),
            clamp(box.width / outer.width),
            clamp(box.height / outer.height),
          ],
          natural_width: Math.round(outer.width),
          natural_height: Math.round(outer.height),
        },
        box,
      );
    };
    root.addEventListener('pointermove', hover);
    root.addEventListener('click', click);
    return () => {
      root.removeEventListener('pointermove', hover);
      root.removeEventListener('click', click);
    };
  }, [bytes, htmlChars, onPick, place]);

  if (!place) return null;
  return (
    <div
      className="absolute z-10"
      data-capture-ui="true"
      data-slot="svg-element-layer"
      style={place}
    >
      <div className="absolute inset-0" ref={layer} />
      {outline ? (
        <div
          className="pointer-events-none absolute border-2 border-primary bg-primary/10"
          style={outline}
        />
      ) : null}
    </div>
  );
}
