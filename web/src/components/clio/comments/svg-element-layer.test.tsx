import type { DocumentAnchor } from '@clio/core/v3';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { svgSelector } from '@/lib/svg-selector';
import { SvgElementLayer } from './svg-element-layer';

afterEach(cleanup);

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" onload="window.__ran=1">' +
  '<g><text>a</text></g><g id="legend"><text>burst buffer</text><text>baseline</text></g>' +
  '<a href="javascript:alert(1)"><polyline points="10,150 100,120" onclick="window.__ran=2"/></a></svg>';

describe('element marks on an SVG image', () => {
  it('names an element by a selector that is unique in the SVG', () => {
    const root = new DOMParser().parseFromString(SVG, 'image/svg+xml').documentElement;
    const baseline = root.querySelectorAll('text')[2]!;
    expect(svgSelector(baseline, root)).toBe('#legend > text:nth-of-type(2)');
    const first = root.querySelector('text')!;
    expect(svgSelector(first, root)).toBe('svg > g:nth-of-type(1) > text');
    expect(
      root.querySelectorAll(svgSelector(first, root).replace(/^svg > /u, ':scope > ')),
    ).toHaveLength(1);
  });

  it('picks the clicked element from an inert copy laid over the image', () => {
    globalThis.ResizeObserver ??= class {
      observe() {}
      disconnect() {}
      unobserve() {}
    } as unknown as typeof ResizeObserver;
    const host = document.createElement('div');
    host.append(document.createElement('img'));
    document.body.append(host);
    const picks: DocumentAnchor[] = [];
    const onPick = vi.fn((anchor: DocumentAnchor) => picks.push(anchor));
    const { container } = render(
      <SvgElementLayer bytes={new TextEncoder().encode(SVG)} host={host} onPick={onPick} />,
    );
    const layer = container.querySelector('[data-slot="svg-element-layer"] > div') as HTMLElement;
    const svg = layer.shadowRoot!.querySelector('svg')!;
    expect(svg.getAttribute('onload')).toBeNull();
    expect(svg.querySelector('polyline')!.getAttribute('onclick')).toBeNull();
    expect(svg.querySelector('a')!.getAttribute('href')).toBeNull();
    svg.querySelectorAll('text')[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(picks).toHaveLength(1);
    expect(picks[0]).toMatchObject({
      profile: 'dom',
      selector: '#legend > text:nth-of-type(1)',
      tag: 'text',
      text_excerpt: 'burst buffer',
    });
    expect(Reflect.get(window, '__ran')).toBeUndefined();
    host.remove();
  });
});
