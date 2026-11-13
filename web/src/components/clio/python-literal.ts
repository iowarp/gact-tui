/**
 * Reads a printed Python value (a `repr` of dicts, lists, tuples, strings, numbers,
 * True, False and None) or JSON, so a script's result can be shown as data instead of
 * the interpreter's text. Anything else (an object repr, a traceback, prose) returns
 * undefined and stays text.
 */
export function parsePrintedValue(text: string): { value: unknown } | undefined {
  const source = text.trim();
  if (!source || !'{[('.includes(source[0]!)) return undefined;
  try {
    return { value: JSON.parse(source) };
  } catch {
    // Not JSON; try the Python form below.
  }
  let at = 0;
  const fail = (): never => {
    throw new SyntaxError(`Unexpected input at ${at}`);
  };
  const space = () => {
    while (at < source.length && /\s/u.test(source[at]!)) at++;
  };
  const sequence = (close: string, read: () => void) => {
    space();
    if (source[at] === close) {
      at++;
      return;
    }
    for (;;) {
      read();
      space();
      const next = source[at++];
      if (next === close) return;
      if (next !== ',') fail();
      space();
      if (source[at] === close) {
        at++;
        return;
      }
    }
  };
  const hex = (length: number) => {
    const digits = source.slice(at, at + length);
    if (!/^[0-9a-f]+$/iu.test(digits) || digits.length !== length) fail();
    at += length;
    return String.fromCodePoint(parseInt(digits, 16));
  };
  const string = (raw: boolean, quote: string) => {
    let out = '';
    while (at < source.length && source[at] !== quote) {
      const char = source[at++]!;
      if (char !== '\\') {
        out += char;
        continue;
      }
      const next = source[at++];
      if (next === undefined) fail();
      if (raw) {
        out += char + next;
        continue;
      }
      out +=
        next === 'n'
          ? '\n'
          : next === 't'
            ? '\t'
            : next === 'r'
              ? '\r'
              : next === '0'
                ? '\0'
                : next === 'x'
                  ? hex(2)
                  : next === 'u'
                    ? hex(4)
                    : next === 'U'
                      ? hex(8)
                      : next;
    }
    if (source[at++] !== quote) fail();
    return out;
  };
  const value = (): unknown => {
    space();
    const char = source[at];
    if (char === '{') {
      at++;
      const out: Record<string, unknown> = {};
      sequence('}', () => {
        const key = value();
        space();
        if (source[at++] !== ':') fail();
        out[typeof key === 'string' ? key : JSON.stringify(key)] = value();
      });
      return out;
    }
    if (char === '[' || char === '(') {
      at++;
      const out: unknown[] = [];
      sequence(char === '[' ? ']' : ')', () => out.push(value()));
      return out;
    }
    const prefix = /^([rRbBuU]{0,2})(['"])/u.exec(source.slice(at, at + 3));
    if (prefix) {
      at += prefix[0].length;
      return string(/r/iu.test(prefix[1]!), prefix[2]!);
    }
    const word = /^(?:True|False|None|-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/u.exec(
      source.slice(at),
    );
    if (!word) fail();
    at += word![0].length;
    return word![0] === 'True'
      ? true
      : word![0] === 'False'
        ? false
        : word![0] === 'None'
          ? null
          : Number(word![0]);
  };
  try {
    const parsed = value();
    space();
    return at === source.length ? { value: parsed } : undefined;
  } catch {
    return undefined;
  }
}
