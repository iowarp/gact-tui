/**
 * A small, safe arithmetic formula language: `<name> = <expression>`.
 *
 * The expression uses numbers, field names, `+ - * /`, powers (`^` or `**`,
 * right-associative), parentheses, the constant `pi`, and the functions
 * `sqrt exp log abs` (one argument; `log` is the natural logarithm) and
 * `min max` (two or more). Anything else is refused with a typed error; the
 * text is tokenized and parsed here, never handed to `eval` or `Function`.
 */

export type FormulaErrorCode =
  | 'empty'
  | 'too_long'
  | 'too_deep'
  | 'unexpected_character'
  | 'invalid_number'
  | 'unexpected_token'
  | 'unexpected_end'
  | 'unknown_function'
  | 'wrong_arity'
  | 'reserved_name'
  | 'not_an_equation';

export interface FormulaError {
  code: FormulaErrorCode;
  message: string;
  /** Character offset in the text where the problem starts. */
  at: number;
}

export type FormulaNode =
  | { kind: 'number'; value: number }
  | { kind: 'name'; name: string }
  | { kind: 'pi' }
  | { kind: 'negate'; argument: FormulaNode }
  | { kind: 'binary'; operator: '+' | '-' | '*' | '/' | '^'; left: FormulaNode; right: FormulaNode }
  | { kind: 'call'; name: FormulaFunction; args: FormulaNode[] };

export type FormulaFunction = 'sqrt' | 'exp' | 'log' | 'abs' | 'min' | 'max';

export interface Formula {
  /** The measured field the left side names. */
  target: string;
  expression: FormulaNode;
  /** The field names the expression reads, in first-use order. */
  names: string[];
}

export type FormulaResult = { ok: true; formula: Formula } | { ok: false; error: FormulaError };

/** Longest formula text accepted. Unit: characters. */
export const FORMULA_MAX_LENGTH = 2_000;
/** Deepest nesting accepted, so a hostile text cannot exhaust the stack. */
export const FORMULA_MAX_DEPTH = 64;

const UNARY_FUNCTIONS = new Set<FormulaFunction>(['sqrt', 'exp', 'log', 'abs']);
const VARIADIC_FUNCTIONS = new Set<FormulaFunction>(['min', 'max']);

type Token =
  | { type: 'number'; value: number; at: number }
  | { type: 'name'; value: string; at: number }
  | { type: 'symbol'; value: '+' | '-' | '*' | '/' | '^' | '(' | ')' | ',' | '='; at: number }
  | { type: 'end'; at: number };

class FormulaFailure extends Error {
  constructor(readonly error: FormulaError) {
    super(error.message);
  }
}

function fail(code: FormulaErrorCode, message: string, at: number): never {
  throw new FormulaFailure({ code, message, at });
}

const NAME_START = /[A-Za-z_]/u;
const NAME_PART = /[A-Za-z0-9_]/u;
const NUMBER = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/u;

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index]!;
    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      index += 1;
      continue;
    }
    if (/[0-9.]/u.test(char)) {
      const match = NUMBER.exec(text.slice(index));
      if (!match) fail('invalid_number', `"${char}" does not start a number.`, index);
      const end = index + match[0].length;
      if (end < text.length && /[A-Za-z0-9_.]/u.test(text[end]!))
        fail('invalid_number', `"${text.slice(index, end + 1)}" is not a number.`, index);
      tokens.push({ type: 'number', value: Number(match[0]), at: index });
      index = end;
      continue;
    }
    if (NAME_START.test(char)) {
      let end = index + 1;
      while (end < text.length && NAME_PART.test(text[end]!)) end += 1;
      tokens.push({ type: 'name', value: text.slice(index, end), at: index });
      index = end;
      continue;
    }
    if (char === '*' && text[index + 1] === '*') {
      tokens.push({ type: 'symbol', value: '^', at: index });
      index += 2;
      continue;
    }
    if ('+-*/^(),='.includes(char)) {
      tokens.push({
        type: 'symbol',
        value: char as '+' | '-' | '*' | '/' | '^' | '(' | ')' | ',' | '=',
        at: index,
      });
      index += 1;
      continue;
    }
    fail('unexpected_character', `"${char}" is not part of the formula language.`, index);
  }
  tokens.push({ type: 'end', at: text.length });
  return tokens;
}

function describe(token: Token): string {
  return token.type === 'end' ? 'the end' : `"${String(token.value)}"`;
}

class Parser {
  private position = 0;
  private depth = 0;
  readonly names: string[] = [];

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.position]!;
  }

  private next(): Token {
    const token = this.tokens[this.position]!;
    if (token.type !== 'end') this.position += 1;
    return token;
  }

  private isSymbol(value: string): boolean {
    const token = this.peek();
    return token.type === 'symbol' && token.value === value;
  }

  private expect(value: string): void {
    const token = this.next();
    if (token.type === 'symbol' && token.value === value) return;
    fail(
      token.type === 'end' ? 'unexpected_end' : 'unexpected_token',
      `Expected "${value}" but found ${describe(token)}.`,
      token.at,
    );
  }

  private enter(at: number): void {
    this.depth += 1;
    if (this.depth > FORMULA_MAX_DEPTH)
      fail('too_deep', `The formula nests deeper than ${FORMULA_MAX_DEPTH} levels.`, at);
  }

  equation(): Formula {
    const target = this.next();
    if (target.type !== 'name' || target.value === 'pi' || this.isFunctionName(target.value))
      fail('not_an_equation', 'A formula starts with the measured field\'s name, then "=".', 0);
    if (!this.isSymbol('='))
      fail('not_an_equation', 'A formula is "<measured field> = <expression>".', this.peek().at);
    this.next();
    const expression = this.sum();
    const end = this.peek();
    if (end.type !== 'end')
      fail('unexpected_token', `Unexpected ${describe(end)} after the expression.`, end.at);
    return { target: target.value, expression, names: this.names };
  }

  private isFunctionName(name: string): name is FormulaFunction {
    return (
      UNARY_FUNCTIONS.has(name as FormulaFunction) ||
      VARIADIC_FUNCTIONS.has(name as FormulaFunction)
    );
  }

  private sum(): FormulaNode {
    let left = this.product();
    while (this.isSymbol('+') || this.isSymbol('-')) {
      const operator = (this.next() as { value: '+' | '-' }).value;
      left = { kind: 'binary', operator, left, right: this.product() };
    }
    return left;
  }

  private product(): FormulaNode {
    let left = this.unary();
    while (this.isSymbol('*') || this.isSymbol('/')) {
      const operator = (this.next() as { value: '*' | '/' }).value;
      left = { kind: 'binary', operator, left, right: this.unary() };
    }
    return left;
  }

  /** A sign binds looser than a power: `-x^2` is `-(x^2)`. */
  private unary(): FormulaNode {
    const token = this.peek();
    if (this.isSymbol('-') || this.isSymbol('+')) {
      this.next();
      this.enter(token.at);
      const argument = this.unary();
      this.depth -= 1;
      return token.type === 'symbol' && token.value === '-'
        ? { kind: 'negate', argument }
        : argument;
    }
    return this.power();
  }

  private power(): FormulaNode {
    const base = this.primary();
    if (!this.isSymbol('^')) return base;
    const token = this.next();
    this.enter(token.at);
    // Right-associative, and the exponent may carry its own sign: 2^-1.
    const exponent = this.unary();
    this.depth -= 1;
    return { kind: 'binary', operator: '^', left: base, right: exponent };
  }

  private primary(): FormulaNode {
    const token = this.next();
    if (token.type === 'number') return { kind: 'number', value: token.value };
    if (token.type === 'symbol' && token.value === '(') {
      this.enter(token.at);
      const inner = this.sum();
      this.expect(')');
      this.depth -= 1;
      return inner;
    }
    if (token.type === 'name') {
      if (this.isSymbol('(')) return this.call(token.value, token.at);
      if (token.value === 'pi') return { kind: 'pi' };
      if (this.isFunctionName(token.value))
        fail(
          'reserved_name',
          `"${token.value}" is a function; call it with parentheses.`,
          token.at,
        );
      if (!this.names.includes(token.value)) this.names.push(token.value);
      return { kind: 'name', name: token.value };
    }
    fail(
      token.type === 'end' ? 'unexpected_end' : 'unexpected_token',
      `Expected a number, a name or "(" but found ${describe(token)}.`,
      token.at,
    );
  }

  private call(name: string, at: number): FormulaNode {
    if (!this.isFunctionName(name))
      fail('unknown_function', `"${name}" is not a known function.`, at);
    this.next();
    this.enter(at);
    const args: FormulaNode[] = [];
    if (!this.isSymbol(')')) {
      args.push(this.sum());
      while (this.isSymbol(',')) {
        this.next();
        args.push(this.sum());
      }
    }
    this.expect(')');
    this.depth -= 1;
    const unary = UNARY_FUNCTIONS.has(name);
    if (unary ? args.length !== 1 : args.length < 2)
      fail(
        'wrong_arity',
        unary
          ? `${name} takes one argument, not ${args.length}.`
          : `${name} takes two or more arguments, not ${args.length}.`,
        at,
      );
    return { kind: 'call', name, args };
  }
}

/** Parse `<name> = <expression>`, or say exactly why the text is not one. */
export function parseFormula(text: string): FormulaResult {
  const source = text.trim();
  if (!source)
    return { ok: false, error: { code: 'empty', message: 'The formula is empty.', at: 0 } };
  if (text.length > FORMULA_MAX_LENGTH)
    return {
      ok: false,
      error: {
        code: 'too_long',
        message: `The formula is longer than ${FORMULA_MAX_LENGTH} characters.`,
        at: FORMULA_MAX_LENGTH,
      },
    };
  try {
    return { ok: true, formula: new Parser(tokenize(source)).equation() };
  } catch (error) {
    if (error instanceof FormulaFailure) return { ok: false, error: error.error };
    throw error;
  }
}

function apply(name: FormulaFunction, args: number[]): number {
  switch (name) {
    case 'sqrt':
      return Math.sqrt(args[0]!);
    case 'exp':
      return Math.exp(args[0]!);
    case 'log':
      return Math.log(args[0]!);
    case 'abs':
      return Math.abs(args[0]!);
    case 'min':
      return Math.min(...args);
    case 'max':
      return Math.max(...args);
  }
}

function evaluate(node: FormulaNode, values: Readonly<Record<string, number>>): number {
  switch (node.kind) {
    case 'number':
      return node.value;
    case 'pi':
      return Math.PI;
    case 'name':
      return values[node.name] ?? Number.NaN;
    case 'negate':
      return -evaluate(node.argument, values);
    case 'call':
      return apply(
        node.name,
        node.args.map((arg) => evaluate(arg, values)),
      );
    case 'binary': {
      const left = evaluate(node.left, values);
      const right = evaluate(node.right, values);
      if (node.operator === '+') return left + right;
      if (node.operator === '-') return left - right;
      if (node.operator === '*') return left * right;
      if (node.operator === '/') return left / right;
      return left ** right;
    }
  }
}

/**
 * The expression's value for `values`, or `undefined` when a name has no
 * value or the result is not a finite number (a root of a negative, a
 * division by zero, an overflow).
 */
export function evaluateFormula(
  expression: FormulaNode,
  values: Readonly<Record<string, number>>,
): number | undefined {
  const value = evaluate(expression, values);
  return Number.isFinite(value) ? value : undefined;
}
