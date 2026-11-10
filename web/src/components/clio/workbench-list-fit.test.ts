// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { fitWorkbenchWidthTo, listNaturalWidth, naturalWidth } from './workbench-list-fit';

/** jsdom does no layout: give an element the box a browser would. */
function box(
  element: HTMLElement,
  { offset = 0, scroll, rect }: { offset?: number; scroll?: number; rect?: number } = {},
) {
  Object.defineProperty(element, 'offsetWidth', { configurable: true, value: offset });
  Object.defineProperty(element, 'scrollWidth', { configurable: true, value: scroll ?? offset });
  element.getBoundingClientRect = () => ({ width: rect ?? offset }) as DOMRect;
  return element;
}

function element(tag: string, style: Partial<CSSStyleDeclaration>, children: HTMLElement[] = []) {
  const node = document.createElement(tag);
  Object.assign(node.style, style);
  node.append(...children);
  return node;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('workbench list fit', () => {
  it('never fits above the stored width or under the minimum', () => {
    expect(fitWorkbenchWidthTo(672, undefined, 320)).toBe(672);
    expect(fitWorkbenchWidthTo(672, 410, 320)).toBe(410);
    expect(fitWorkbenchWidthTo(672, 200, 320)).toBe(320);
    expect(fitWorkbenchWidthTo(512, 900, 320)).toBe(512);
  });

  it('measures a stretched row by its content, not the space it fills', () => {
    // A 28px status, a growing text cell (a truncated 180px title and an
    // 80px description) and a 58px badge, with 8px gaps and 6px padding.
    const title = box(
      element('span', { overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: '1' }),
      { offset: 120, scroll: 180 },
    );
    const description = box(
      element('span', { overflow: 'hidden', textOverflow: 'ellipsis', flexGrow: '1' }),
      { offset: 400, scroll: 80 },
    );
    const text = box(
      element('span', { display: 'flex', flexGrow: '1', columnGap: '8px' }, [title, description]),
      { offset: 528 },
    );
    const row = box(
      element(
        'div',
        {
          display: 'flex',
          flexGrow: '1',
          columnGap: '8px',
          paddingLeft: '6px',
          paddingRight: '6px',
        },
        [
          box(element('span', { flexShrink: '0' }), { offset: 28 }),
          text,
          box(element('span', { flexShrink: '0' }), { offset: 58 }),
        ],
      ),
      { offset: 640 },
    );
    expect(naturalWidth(row)).toBe(6 + 28 + 8 + (180 + 8 + 80) + 8 + 58 + 6);
  });

  it('takes the widest rendered row plus its inset in the list', () => {
    const narrow = box(element('div', { flexShrink: '0' }), { offset: 200, rect: 600 });
    narrow.dataset.slot = 'list-row';
    const wide = box(element('div', { flexShrink: '0' }), { offset: 300, rect: 600 });
    wide.dataset.slot = 'list-row';
    const list = box(element('section', {}, [narrow, wide]), { rect: 616 });
    document.body.append(list);
    expect(listNaturalWidth(list)).toBe(316);
  });
});
