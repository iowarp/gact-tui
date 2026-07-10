/**
 * ONE spec'd home for the web client's TRANSITIONAL prose-heuristic presentation
 * filters (contract/SPEC.md Appendix — "Transitional client presentation filters
 * (non-normative)"). These functions inspect model prose with keyword/shape
 * heuristics to hide backend orchestration chrome, placeholder text, bare JSON
 * bodies, and duplicated reasoning that the current backend still leaks onto the
 * clean stream.
 *
 * They are DELIBERATELY transitional: every one of them exists only because the
 * server does not yet emit a byte-clean transcript. Per clio #832 (the server
 * owns the clean stream; the client renders verbatim and must NOT own dedup/
 * validity), each filter carries a documented DELETION CONDITION in the SPEC
 * appendix — once clio stops emitting the corresponding chrome, the filter is
 * deleted, not weakened. Do NOT add new dedup or weaken these here; centralizing
 * them in one module is exactly so the deletion is a single, auditable step.
 *
 * Behaviour is BYTE-IDENTICAL to the previous inline definitions in
 * transcriptDelegationModel.ts and clioScaffolding.ts — this module is a move,
 * pinned by presentationFilters.test.ts characterization tests.
 */
import type { TurnRow } from './transcriptDelegationModel.js';
import { findBalancedJsonEnd } from '../presentationUtils.js';

/** A line that is wholly a status parenthetical the backend injected. */
const STATUS_PAREN =
  /^\(\s*(?:initiat|rout|delegat|dispatch|await|synthesi[sz]|in progress|orchestrat|invoking|preparing|continuing|resuming|finaliz|coordinat|gathering|querying)[a-z]*\b[^)]*\)\s*$/i;

/** A bare `(In progress …)` / `(awaiting …)` placeholder, anywhere on a line. */
const IN_PROGRESS = /\(\s*(?:in progress|awaiting)\b[^)]*\)/gi;
const BARE_IN_PROGRESS_LINE = /^\s*(?:in progress|awaiting)\s*:[^\n]*(?:\n|$)/gim;
const NO_USER_FACING_ANSWER_LINE = /^\s*\(\s*no user-facing answer yet\b[^)]*\)\s*(?:\n|$)/gim;

/** A caption introducing a display-only typed-state JSON blob. */
const STATE_CAPTION = /(^|\n)\s*[^\n{}]{0,80}?\btyped workflow state\b[^\n{}]{0,40}:\s*\n?\s*\{/i;
const STATE_CAPTION_LINE = /^\s*[^\n{}]{0,80}?\btyped workflow state\b[^\n{}]{0,40}:\s*$/gim;
const RETAINED_EVIDENCE_LINE =
  /^\s*(?:\[\.\.\.delegation output truncated; exact evidence retained below\.\.\.\]|\[exact retained evidence index\])\s*$/gim;

/**
 * Strip CLIO-generated SCAFFOLDING glued into model answer/reasoning text. This
 * is backend-emitted status chrome the model leaves inline — NOT part of the
 * model's actual prose — and the owner does not want it in the rendered
 * conversation.
 *
 * What it removes (FORMAT-based, never matching a backend's protocol vocabulary
 * by hardcoded key names):
 *   - Standalone status parentheticals at the head of a line, e.g.
 *     `(Initiating the workflow …)`, `(Routing to the geospatial expert …)`,
 *     `(In progress — awaiting synthesis …)`. Detected by the parenthetical
 *     containing a present-participle status verb (`-ing …`) and nothing else on
 *     the line, OR an `in progress` / `awaiting` placeholder.
 *   - A `CLIO typed workflow state:` / `Retained typed workflow state:` caption
 *     followed by a JSON blob — display-only machine state, not prose.
 *
 * It is deliberately conservative: it only strips a parenthetical that occupies
 * (essentially) a whole line, so a parenthetical mid-sentence in real prose is
 * left untouched.
 */
export function stripClioScaffolding(text: string): string {
  if (!text) return '';
  let out = text;

  // 1) Remove a `… typed workflow state: { … }` blob (caption + balanced JSON).
  for (let guard = 0; guard < 6; guard++) {
    const m = STATE_CAPTION.exec(out);
    if (!m) break;
    const braceIdx = out.indexOf('{', m.index);
    if (braceIdx < 0) break;
    const end = findBalancedJsonEnd(out, braceIdx);
    if (end < 0) break;
    const cut = m.index + (m[1] ? m[1].length : 0);
    out = (out.slice(0, cut).trimEnd() + '\n' + out.slice(end + 1).trimStart()).trim();
  }

  // 2) Drop inline `(In progress…)` / `(awaiting…)` placeholders.
  out = out.replace(IN_PROGRESS, '');
  out = out.replace(BARE_IN_PROGRESS_LINE, '');
  out = out.replace(NO_USER_FACING_ANSWER_LINE, '');
  out = out.replace(STATE_CAPTION_LINE, '');
  out = out.replace(RETAINED_EVIDENCE_LINE, '');

  // 3) Drop whole-line status parentheticals.
  out = out
    .split('\n')
    .filter((line) => !STATUS_PAREN.test(line.trim()))
    .join('\n');

  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function hasPriorAnswerRow(rows: readonly TurnRow[], beforeIndex: number): boolean {
  return rows.slice(0, beforeIndex).some((row) => {
    if (row.kind !== 'text') return false;
    if (row.agent !== 'synthesis' && row.agent !== 'main') return false;
    const text = row.text.trim();
    return text.length > 20 && !isOrchestrationPlaceholder(text) && !isBareJsonBody(text);
  });
}

export function isBareJsonBody(text: string): boolean {
  const body = text.trim();
  if (!body) return false;
  const wrapped =
    (body.startsWith('{') && body.endsWith('}')) ||
    (body.startsWith('[') && body.endsWith(']'));
  if (!wrapped) return false;
  try {
    JSON.parse(body);
    return true;
  } catch {
    return false;
  }
}

export function isOrchestrationPlaceholder(text: string): boolean {
  const body = text.toLowerCase();
  if (/no user-facing answer yet/.test(body)) return true;
  if (/awaiting .*child/.test(body)) return true;
  if (/awaiting .*synthesis/.test(body)) return true;
  if (/no evidence (?:yet|is available)/.test(body)) return true;
  if (/pending .*delegation/.test(body)) return true;
  if (/delegating to .*expert/.test(body)) return true;
  if (/routing to synthesis/.test(body)) return true;
  if (/routing to the .*expert/.test(body)) return true;
  if (/before routing to synthesis/.test(body)) return true;
  if (/before finishing/.test(body)) return true;
  return false;
}

