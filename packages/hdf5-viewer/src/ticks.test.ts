import { describe, expect, it } from 'vitest';
import { THINNED, plainTick, thinAxis } from './ticks';

describe('plainTick', () => {
  it('writes out whole numbers below 1e5', () => {
    expect(plainTick('1e+3')).toBe('1000');
    expect(plainTick('4e+3')).toBe('4000');
    expect(plainTick('1.5e+3')).toBe('1500');
    expect(plainTick('\u22122e+3')).toBe('\u22122000');
    expect(plainTick('9.99e+4')).toBe('99900');
  });

  it('keeps other labels', () => {
    expect(plainTick('1e+5')).toBeUndefined();
    expect(plainTick('1.234e+1')).toBeUndefined();
    expect(plainTick('5.23e-6')).toBeUndefined();
    expect(plainTick('500')).toBeUndefined();
  });
});

/** An x axis whose labels sit `spacing` px apart, each `width` px wide. */
function axis(labels: string[], spacing: number, width: number) {
  document.body.innerHTML = `<svg><g class="visx-axis-bottom">${labels
    .map((label) => `<g class="visx-axis-tick"><text>${label}</text></g>`)
    .join('')}</g></svg>`;
  const texts = [...document.querySelectorAll('text')];
  texts.forEach((text, index) => {
    const left = index * spacing;
    text.getBoundingClientRect = () =>
      ({ left, right: left + width, top: 0, bottom: 10, width, height: 10 }) as DOMRect;
  });
  return { element: document.querySelector('.visx-axis-bottom')!, texts };
}

const shown = (texts: Element[]) =>
  texts.filter((text) => !text.hasAttribute(THINNED)).map((text) => text.textContent);

describe('thinAxis', () => {
  it('writes index ticks out and keeps every label that has room', () => {
    const { element, texts } = axis(['0', '1e+3', '2e+3', '3e+3', '4e+3'], 120, 28);
    thinAxis(element);
    expect(shown(texts)).toEqual(['0', '1000', '2000', '3000', '4000']);
  });

  it('hides evenly from the first until labels are 12px apart', () => {
    const { element, texts } = axis(['0', '1e+3', '2e+3', '3e+3', '4e+3'], 36, 28);
    thinAxis(element);
    expect(shown(texts)).toEqual(['0', '2000', '4000']);
  });

  it('keeps only the first label when no two fit', () => {
    const { element, texts } = axis(['0', '2e+3', '4e+3'], 15, 28);
    thinAxis(element);
    expect(shown(texts)).toEqual(['0']);
  });
});
