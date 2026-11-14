import { describe, expect, it } from 'vitest';
import { type CellChild, isCodeOnlyCell } from './markdown-cells';

const code: CellChild = { type: 'element', tagName: 'code' };
const text = (value: string): CellChild => ({ type: 'text', value });

describe('isCodeOnlyCell', () => {
  it('marks a cell that holds only an identifier', () => {
    expect(isCodeOnlyCell([code])).toBe(true);
    expect(isCodeOnlyCell([text(' '), code, text('\n')])).toBe(true);
  });

  it('leaves a sentence with one inline code name as prose', () => {
    expect(isCodeOnlyCell([text('Runs '), code, text(' on the raw JSON file first.')])).toBe(false);
    expect(isCodeOnlyCell([code, code])).toBe(false);
    expect(isCodeOnlyCell([])).toBe(false);
  });
});
