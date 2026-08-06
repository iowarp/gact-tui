/**
 * `tool_title`/`server_title` (owner design 2026-08-05) are OPTIONAL wire
 * fields a tool server attaches to a tool_call for display — untrusted
 * upstream input, never the model's own text. React already escapes markup,
 * but a raw control character or embedded newline would still break the
 * single-line row layout the title renders into (ToolPart's
 * `.part-toolrow__namewrap`), and an unbounded string could blow it out
 * entirely. This is the ONE place that clamp/strip happens — every render
 * site funnels through it rather than re-deriving its own guard.
 */
import { truncate } from '../../wire/presentationUtils';

const MAX_TITLE_LEN = 80;

// All C0 controls + DEL, built from character codes rather than literal
// escapes so the source file never carries a raw control byte — covers
// newline/carriage-return/tab along with anything else that could relayout
// or corrupt the single-line row.
const CONTROL_CHARS_RANGE = `${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}`;
const CONTROL_CHARS_RE = new RegExp(`[${CONTROL_CHARS_RANGE}]`, 'g');

/**
 * Strips control characters (including newlines) and clamps to
 * {@link MAX_TITLE_LEN} characters. A non-string `raw`, or a string that
 * strips/trims down to nothing, falls back to `fallback` (the caller's raw
 * tool name) — a title never renders as blank when a real name exists.
 */
export function sanitizeTitle(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const stripped = raw.replace(CONTROL_CHARS_RE, '').trim();
  return stripped ? truncate(stripped, MAX_TITLE_LEN) : fallback;
}

/** Lowercase, then drop underscores/hyphens/spaces — the shared shape both
 *  {@link titleIsRedundantWithRawName} sides compare on, so `Create Artifact`
 *  and `create_artifact` collapse to the identical `createartifact`. */
const TITLE_COMPARE_STRIP_RE = /[_\- ]+/g;

/**
 * Row-render defect #1 (owner-quoted, P4R): `Create Artifact` bold, with
 * `create_artifact` repeated directly below it in the muted raw-name slot,
 * is visual duplication — the title already carries the fact, the raw name
 * beneath it says nothing new. Two names are "the same fact twice" when they
 * match modulo case and `[_ -]` — normalize both sides (lowercase, strip
 * underscores/hyphens/spaces) and compare for exact equality; nothing
 * fuzzier (a substring or edit-distance match would risk hiding a genuinely
 * distinct raw name, e.g. `Describe` vs. `jarvis_describe`, which must keep
 * BOTH — the raw identifier is what actually went to the model and stays
 * visible whenever it adds information the title doesn't already state).
 */
export function titleIsRedundantWithRawName(title: string, rawName: string): boolean {
  const normalize = (value: string) => value.toLowerCase().replace(TITLE_COMPARE_STRIP_RE, '');
  return normalize(title) === normalize(rawName);
}
