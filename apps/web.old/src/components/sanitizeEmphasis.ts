/**
 * Escape STRAY markdown emphasis delimiters before feeding text to smd.
 *
 * Why this exists: streaming-markdown (smd) does NOT implement CommonMark's
 * emphasis "flanking" rules. A lone `_` or `*` that CommonMark would leave literal
 * (shell_bash, time_s, star-slash, slash-star, star-dot-py, 2-star-3) makes smd open an emphasis
 * span that never closes — so everything after it cascades into italics/bold. The
 * library has no option to disable or correct this (its `parser()` takes only a
 * renderer; `*`/`_` handling is hardcoded), so we pre-escape the offending
 * delimiters. smd honors backslash escapes (`\_` -> `_`, `\*` -> `*`).
 *
 * What we KEEP untouched: genuine paired emphasis (`*italic*`, `**bold**`,
 * `__bold__`), `* ` / `- ` list bullets, and everything inside inline/fenced code
 * (where underscores/asterisks are already literal and a backslash would leak).
 *
 * The rule is CommonMark's delimiter flanking, then greedy pair-matching; any run
 * that can open/close but never pairs is escaped. `_` runs are additionally always
 * escaped when unpaired (smd emphasizes intraword `_`, which CommonMark forbids),
 * while bare whitespace-flanked `*` (bullets, ` a * b `) is left alone.
 */

const ASCII_PUNCT = new Set("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~".split(''));

const isWsOrEdge = (ch: string | undefined): boolean => ch === undefined || /\s/.test(ch);
const isPunct = (ch: string | undefined): boolean => ch !== undefined && ASCII_PUNCT.has(ch);

interface Run {
  char: '*' | '_';
  start: number;
  end: number;
  canOpen: boolean;
  canClose: boolean;
}

/** Find maximal runs of `*`/`_` and classify each as an emphasis opener/closer per CommonMark flanking. */
function findRuns(s: string): Run[] {
  const runs: Run[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '*' || c === '_') {
      let j = i;
      while (j < s.length && s[j] === c) j++;
      const prev = i > 0 ? s[i - 1] : undefined;
      const next = j < s.length ? s[j] : undefined;
      const prevWs = isWsOrEdge(prev);
      const nextWs = isWsOrEdge(next);
      const prevP = isPunct(prev);
      const nextP = isPunct(next);
      // left-flanking: not followed by whitespace, and (not followed by punctuation
      // OR preceded by whitespace/punctuation).
      const leftFlank = !nextWs && (!nextP || prevWs || prevP);
      // right-flanking: not preceded by whitespace, and (not preceded by punctuation
      // OR followed by whitespace/punctuation).
      const rightFlank = !prevWs && (!prevP || nextWs || nextP);
      let canOpen: boolean;
      let canClose: boolean;
      if (c === '*') {
        canOpen = leftFlank;
        canClose = rightFlank;
      } else {
        // `_`: stricter — cannot open/close intraword.
        canOpen = leftFlank && (!rightFlank || prevP);
        canClose = rightFlank && (!leftFlank || nextP);
      }
      runs.push({ char: c, start: i, end: j, canOpen, canClose });
      i = j;
    } else {
      i++;
    }
  }
  return runs;
}

const isAlnum = (ch: string | undefined): boolean => ch !== undefined && /[A-Za-z0-9]/.test(ch);

// Code digraphs that must NEVER be emphasis, even if CommonMark flanking would let
// them coincidentally pair with another stray star on the same line: slash-star,
// star-slash, and an opener-position star-dot (glob/extension). Deliberately NOT a
// star-dot whose star closes a word (a closer like "*italic*.") nor bold before a
// period ("**bold**.").
function isForcedStar(s: string, run: Run): boolean {
  if (run.char !== '*') return false;
  const prevChar = run.start > 0 ? s[run.start - 1] : undefined;
  const nextChar = run.end < s.length ? s[run.end] : undefined;
  if (prevChar === '/' || nextChar === '/') return true;
  if (nextChar === '.' && !isAlnum(prevChar) && prevChar !== '*' && prevChar !== '_') return true;
  return false;
}

/** Positions of delimiter characters that should be backslash-escaped. */
function strayPositions(s: string): Set<number> {
  const runs = findRuns(s);
  const forced = new Set<Run>();
  for (const run of runs) {
    if (isForcedStar(s, run)) forced.add(run);
  }
  const paired = new Set<Run>();
  const openStack: Run[] = [];
  for (const run of runs) {
    if (forced.has(run)) continue; // code digraph — never pairs
    if (run.canClose) {
      let matched = false;
      for (let k = openStack.length - 1; k >= 0; k--) {
        const opener = openStack[k];
        if (opener && opener.char === run.char) {
          paired.add(opener);
          paired.add(run);
          openStack.length = k; // pop the opener and anything nested above it
          matched = true;
          break;
        }
      }
      if (!matched && run.canOpen) openStack.push(run);
    } else if (run.canOpen) {
      openStack.push(run);
    }
  }
  const stray = new Set<number>();
  for (const run of runs) {
    if (paired.has(run)) continue;
    // Escape when it would mislead smd: a forced code digraph (`/*`, `*/`, `*.`),
    // any unpaired `_` (smd emphasizes intraword `_`), or an unpaired `*` that can
    // flank (so bullets / ` a * b ` stay untouched).
    if (forced.has(run) || run.char === '_' || run.canOpen || run.canClose) {
      for (let p = run.start; p < run.end; p++) stray.add(p);
    }
  }
  return stray;
}

function escapeSegment(seg: string): string {
  const stray = strayPositions(seg);
  if (stray.size === 0) return seg;
  let out = '';
  for (let i = 0; i < seg.length; i++) {
    if (stray.has(i)) out += '\\';
    out += seg[i];
  }
  return out;
}

/**
 * Escape stray `*`/`_` emphasis delimiters in `text`, skipping inline/fenced code
 * spans (kept at odd indices by the capture group). Inside code the delimiters are
 * already literal and a backslash would render visibly.
 */
export function sanitizeEmphasis(text: string): string {
  return text
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((seg, i) => (i % 2 === 0 ? escapeSegment(seg) : seg))
    .join('');
}
