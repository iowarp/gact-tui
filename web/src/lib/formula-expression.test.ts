import { describe, expect, it } from 'vitest';
import {
  FORMULA_MAX_DEPTH,
  FORMULA_MAX_LENGTH,
  evaluateFormula,
  parseFormula,
  type FormulaErrorCode,
} from './formula-expression';

function value(text: string, values: Record<string, number> = {}): number | undefined {
  const parsed = parseFormula(text);
  if (!parsed.ok) throw new Error(`${parsed.error.code}: ${parsed.error.message}`);
  return evaluateFormula(parsed.formula.expression, values);
}

function refusal(text: string): FormulaErrorCode {
  const parsed = parseFormula(text);
  if (parsed.ok) throw new Error(`accepted ${text}`);
  return parsed.error.code;
}

describe('formula expressions', () => {
  it('reads the target, the names and a threshold written with max', () => {
    const parsed = parseFormula(
      'y_total = 20.4 * x_len^0.59 * sqrt(1 + 0.026*max(0, x_temp - 22))',
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.formula.target).toBe('y_total');
    expect(parsed.formula.names).toEqual(['x_len', 'x_temp']);
    const at = (len: number, temp: number) =>
      evaluateFormula(parsed.formula.expression, { x_len: len, x_temp: temp });
    expect(at(1, 20)).toBeCloseTo(20.4, 10);
    expect(at(1, 32)).toBeCloseTo(20.4 * Math.sqrt(1.26), 10);
    expect(at(2, 22)).toBeCloseTo(20.4 * 2 ** 0.59, 10);
  });

  it('follows arithmetic precedence and associativity', () => {
    expect(value('y = 1 + 2 * 3')).toBe(7);
    expect(value('y = (1 + 2) * 3')).toBe(9);
    expect(value('y = 8 / 4 / 2')).toBe(1);
    expect(value('y = 10 - 4 - 3')).toBe(3);
    expect(value('y = 2 ^ 3 ^ 2')).toBe(512);
    expect(value('y = 2 ** 3 ** 2')).toBe(512);
    expect(value('y = -2 ^ 2')).toBe(-4);
    expect(value('y = 2 ^ -1')).toBe(0.5);
    expect(value('y = -(-3)')).toBe(3);
    expect(value('y = +4')).toBe(4);
    expect(value('y = 2*pi')).toBeCloseTo(2 * Math.PI, 12);
    expect(value('y = 1.5e2 + .5 + 2.')).toBe(152.5);
  });

  it('evaluates every function of the grammar', () => {
    expect(value('y = sqrt(16)')).toBe(4);
    expect(value('y = exp(0)')).toBe(1);
    expect(value('y = log(exp(2))')).toBeCloseTo(2, 12);
    expect(value('y = abs(-3)')).toBe(3);
    expect(value('y = min(4, 2, 9)')).toBe(2);
    expect(value('y = max(a, b)', { a: 1, b: 5 })).toBe(5);
  });

  it('has no value where the arithmetic has none', () => {
    expect(value('y = sqrt(-1)')).toBeUndefined();
    expect(value('y = 1 / 0')).toBeUndefined();
    expect(value('y = log(0)')).toBeUndefined();
    expect(value('y = a + 1')).toBeUndefined();
    expect(value('y = (-8) ^ 0.5')).toBeUndefined();
  });

  it.each<[string, FormulaErrorCode]>([
    ['', 'empty'],
    ['   ', 'empty'],
    ['2 * x', 'not_an_equation'],
    ['y', 'not_an_equation'],
    ['pi = 3', 'not_an_equation'],
    ['sqrt = x', 'not_an_equation'],
    ['y + 1 = x', 'not_an_equation'],
    ['y = x = z', 'unexpected_token'],
    ['y == x', 'unexpected_token'],
    ['y = 2 x', 'unexpected_token'],
    ['y = 2(x)', 'unexpected_token'],
    ['y = x)', 'unexpected_token'],
    ['y = (x', 'unexpected_end'],
    ['y = x +', 'unexpected_end'],
    ['y = ', 'unexpected_end'],
    ['y = x % 2', 'unexpected_character'],
    ['y = x; alert(1)', 'unexpected_character'],
    ['y = "x"', 'unexpected_character'],
    ['y = x.length', 'invalid_number'],
    ['y = 1.2.3', 'invalid_number'],
    ['y = 2e', 'invalid_number'],
    ['y = 2√x', 'unexpected_character'],
    ['y = π', 'unexpected_character'],
    ['y = sin(x)', 'unknown_function'],
    ['y = constructor(x)', 'unknown_function'],
    ['y = sqrt', 'reserved_name'],
    ['y = sqrt(1, 2)', 'wrong_arity'],
    ['y = log()', 'wrong_arity'],
    ['y = max(1)', 'wrong_arity'],
    ['y = x ? 1 : 2', 'unexpected_character'],
    ['y = [1]', 'unexpected_character'],
  ])('refuses %j with %s', (text, code) => {
    expect(refusal(text)).toBe(code);
  });

  it('refuses an over-long or over-deep text instead of exhausting the stack', () => {
    expect(refusal(`y = ${'1+'.repeat(FORMULA_MAX_LENGTH)}1`)).toBe('too_long');
    const depth = FORMULA_MAX_DEPTH + 1;
    expect(refusal(`y = ${'('.repeat(depth)}1${')'.repeat(depth)}`)).toBe('too_deep');
    expect(refusal(`y = ${'-'.repeat(depth)}1`)).toBe('too_deep');
    expect(refusal(`y = ${'2^'.repeat(depth)}1`)).toBe('too_deep');
  });

  it('says where a refused text goes wrong', () => {
    const parsed = parseFormula('y = 1 + sin(x)');
    expect(parsed).toMatchObject({ ok: false, error: { code: 'unknown_function', at: 8 } });
  });
});
