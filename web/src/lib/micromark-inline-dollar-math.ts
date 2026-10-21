import type { Construct, State, Tokenizer } from 'micromark-util-types';

declare module 'micromark-util-types' {
  interface TokenTypeMap {
    clioDollarMath: 'clioDollarMath';
  }
}

const lineEnding = (code: number | null) => code === -5 || code === -4 || code === -3;
const whitespace = (code: number | null) =>
  code === 32 || code === -2 || code === -1 || lineEnding(code);

/** Parse $math$ without treating adjacent currency amounts as a formula. */
export function inlineDollarMath(): Construct {
  const tokenize: Tokenizer = function (effects, ok, nok) {
    let hasContent = false;
    let lastWhitespace = false;
    const start: State = (code) => {
      effects.enter('clioDollarMath');
      effects.consume(code);
      return opening;
    };
    const opening: State = (code) => {
      // Double dollars remain owned by the existing remark-math plugin.
      if (code === null || code === 36 || whitespace(code)) return nok(code);
      return content(code);
    };
    const content: State = (code) => {
      if (code === null) return nok(code);
      if (code === 36) {
        // Reject this opener completely, so a later $formula$ still parses.
        if (!hasContent || lastWhitespace) return nok(code);
        effects.consume(code);
        return closing;
      }
      if (code === 92) {
        effects.consume(code);
        return escaped;
      }
      // Inline $math$ stays on one line, so text like "$task ...\n... $draft" is
      // prose. (A nested line-ending token would also leave no open token for the
      // next consume, which micromark rejects.)
      if (lineEnding(code)) return nok(code);
      lastWhitespace = whitespace(code);
      if (!lastWhitespace) hasContent = true;
      effects.consume(code);
      return content;
    };
    const escaped: State = (code) => {
      if (code === null || lineEnding(code)) return content(code);
      effects.consume(code);
      hasContent = true;
      lastWhitespace = false;
      return content;
    };
    const closing: State = (code) => {
      // $20–$30 is a price range; $$ belongs to the double-dollar grammar.
      if (code === 36 || (code !== null && code >= 48 && code <= 57)) return nok(code);
      effects.exit('clioDollarMath');
      return ok(code);
    };
    return start;
  };
  return { name: 'clioDollarMath', tokenize };
}
