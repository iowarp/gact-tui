/**
 * Empirical death-certificate for every client presentation filter epic #880 deleted.
 *
 * The filters below were removed from the render path because the SERVER stopped
 * emitting the shapes they guarded against. This script proves that claim against a
 * REAL captured wire instead of against our belief about the backend: it replays each
 * deleted predicate over every user-visible string in a live capture and counts hits.
 *
 *   ZERO hits  -> the deletion is a no-op on real output; the filter was dead.
 *   ANY hit    -> the server still emits the shape. The deletion is NOT safe, and the
 *                 fix belongs at the emit site, never back in the renderer (#832).
 *
 * A clean run is necessary but NOT sufficient: one capture cannot exercise every emit
 * path (see the backend emit-path audit that accompanies it). Treat a green run as
 * "no leak observed on this wire", not "no leak exists".
 *
 * Usage:
 *   node scripts/verify-deleted-filters.mjs --probe screenshots/<sse-probe-dir>
 *   node scripts/verify-deleted-filters.mjs --messages <messages.json>
 *
 * `--probe` reads a probe directory produced by `pnpm --filter @clio/web probe:earthscope-sse`
 * (its `messages.json`, plus `backend-sse-events.jsonl` when present).
 * Exits non-zero on any hit.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

/* ── The deleted predicates, verbatim from the commit that removed them ──────────
 * presentationFilters.ts @ d02eee41^ (stripClioScaffolding, isOrchestrationPlaceholder,
 * isBareJsonBody) and transcriptDelegationModel.ts (stripStatusPrefix, dropBareJsonSummary).
 * Copied EXACTLY — a re-typed approximation would prove nothing about the real filter. */

const STATUS_PAREN =
  /^\(\s*(?:initiat|rout|delegat|dispatch|await|synthesi[sz]|in progress|orchestrat|invoking|preparing|continuing|resuming|finaliz|coordinat|gathering|querying)[a-z]*\b[^)]*\)\s*$/i;
const IN_PROGRESS = /\(\s*(?:in progress|awaiting)\b[^)]*\)/gi;
const BARE_IN_PROGRESS_LINE = /^\s*(?:in progress|awaiting)\s*:[^\n]*(?:\n|$)/gim;
const NO_USER_FACING_ANSWER_LINE = /^\s*\(\s*no user-facing answer yet\b[^)]*\)\s*(?:\n|$)/gim;
const STATE_CAPTION = /(^|\n)\s*[^\n{}]{0,80}?\btyped workflow state\b[^\n{}]{0,40}:\s*\n?\s*\{/i;
const STATE_CAPTION_LINE = /^\s*[^\n{}]{0,80}?\btyped workflow state\b[^\n{}]{0,40}:\s*$/gim;
const RETAINED_EVIDENCE_LINE =
  /^\s*(?:\[\.\.\.delegation output truncated; exact evidence retained below\.\.\.\]|\[exact retained evidence index\])\s*$/gim;
/** `transcriptDelegationModel.ts` — the `A -> B | status |` de-merger. */
const STATUS_PREFIX = /^\s*\S+\s*->\s*\S+\s*\|/;
/** `[[ ## field ## ]]` ChatAdapter section markers leaking into prose (#877). */
const SECTION_MARKER = /\[\[\s*##/;

/** `isBareJsonBody` — the whole trimmed body parses as a JSON object/array. */
function isBareJsonBody(text) {
  const trimmed = (text ?? '').trim();
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return false;
  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === 'object' && parsed !== null;
  } catch {
    return false;
  }
}

/** `isOrchestrationPlaceholder` — LIVE-MODEL class: only the model can author it. */
const ORCHESTRATION_PLACEHOLDER =
  /^\s*\(?\s*(?:awaiting child expert evidence|no user-facing answer yet|you have no evidence yet)\b/i;

const CHECKS = [
  { id: 'stripClioScaffolding/STATUS_PAREN', kind: 'regex', re: STATUS_PAREN, perLine: true },
  { id: 'stripClioScaffolding/IN_PROGRESS', kind: 'regex', re: IN_PROGRESS },
  { id: 'stripClioScaffolding/BARE_IN_PROGRESS_LINE', kind: 'regex', re: BARE_IN_PROGRESS_LINE },
  { id: 'stripClioScaffolding/NO_USER_FACING_ANSWER_LINE', kind: 'regex', re: NO_USER_FACING_ANSWER_LINE },
  { id: 'stripClioScaffolding/STATE_CAPTION', kind: 'regex', re: STATE_CAPTION },
  { id: 'stripClioScaffolding/STATE_CAPTION_LINE', kind: 'regex', re: STATE_CAPTION_LINE },
  { id: 'stripClioScaffolding/RETAINED_EVIDENCE_LINE', kind: 'regex', re: RETAINED_EVIDENCE_LINE },
  { id: 'stripStatusPrefix', kind: 'regex', re: STATUS_PREFIX, perLine: true },
  { id: 'sectionMarker(#877)', kind: 'regex', re: SECTION_MARKER },
  { id: 'isOrchestrationPlaceholder', kind: 'regex', re: ORCHESTRATION_PLACEHOLDER, perLine: true },
  { id: 'isBareJsonBody/dropBareJsonSummary', kind: 'fn', fn: isBareJsonBody },
];

function matches(check, text) {
  if (!text) return false;
  if (check.kind === 'fn') return check.fn(text);
  if (check.perLine) return text.split('\n').some((line) => new RegExp(check.re.source, check.re.flags.replace('g', '')).test(line));
  // Fresh RegExp per call: a /g/ regex carries lastIndex between .test() calls.
  return new RegExp(check.re.source, check.re.flags.replace('g', '')).test(text);
}

/**
 * Every string a USER can see. Deliberately narrow: structured carriers
 * (workflow_state, output_raw, tool results) are typed parts the renderer never
 * treats as prose, so a JSON body there is correct, not a leak.
 */
function* visibleStrings(messages) {
  for (const message of messages) {
    for (const part of message.parts ?? []) {
      const type = part.type;
      if (type === 'text' || type === 'reasoning' || type === 'thinking') {
        yield { where: `${message.id}/${part.id ?? type}:${type}.text`, text: part.text ?? '' };
      }
      if (type === 'expert_handoff') {
        // The delegation header's task line and the return's one-liner both render verbatim.
        const meta = part.metadata ?? {};
        yield { where: `${message.id}/${part.id ?? type}:handoff.text`, text: part.text ?? '' };
        yield { where: `${message.id}/${part.id ?? type}:handoff.output_summary`, text: meta.output_summary ?? '' };
        yield { where: `${message.id}/${part.id ?? type}:handoff.question`, text: meta.question ?? '' };
      }
      if (type === 'tool_call' && part.thought) {
        yield { where: `${message.id}/${part.id ?? type}:tool_call.thought`, text: part.thought };
      }
    }
  }
}

function parseArgs(argv) {
  const opts = { probe: '', messages: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (!value) throw new Error(`${arg} requires a value`);
      return value;
    };
    if (arg === '--probe') opts.probe = next();
    else if (arg === '--messages') opts.messages = next();
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/verify-deleted-filters.mjs (--probe <dir> | --messages <file.json>)');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!opts.probe && !opts.messages) throw new Error('one of --probe or --messages is required');
  return opts;
}

async function loadMessages(opts) {
  const file = opts.messages || path.join(opts.probe, 'messages.json');
  const raw = JSON.parse(await fs.readFile(file, 'utf8'));
  const messages = Array.isArray(raw) ? raw : (raw.messages ?? []);
  if (!messages.length) throw new Error(`no messages found in ${file}`);
  return { file, messages };
}

const opts = parseArgs(process.argv.slice(2));
const { file, messages } = await loadMessages(opts);

const hits = [];
let scanned = 0;
for (const { where, text } of visibleStrings(messages)) {
  if (!text) continue;
  scanned += 1;
  for (const check of CHECKS) {
    if (matches(check, text)) {
      hits.push({ check: check.id, where, sample: text.slice(0, 160).replace(/\n/g, '\\n') });
    }
  }
}

console.log(`source   : ${file}`);
console.log(`messages : ${messages.length}`);
console.log(`strings  : ${scanned} user-visible strings scanned`);
console.log(`checks   : ${CHECKS.length} deleted client filters replayed\n`);

if (!hits.length) {
  console.log('OK: zero hits. Every deleted filter is a no-op on this wire.');
  console.log('    (Necessary, not sufficient — pair with the backend emit-path audit.)');
  process.exit(0);
}

console.error(`FAIL: ${hits.length} hit(s) — the server still emits a shape a deleted filter guarded.\n`);
for (const hit of hits) {
  console.error(`  [${hit.check}]`);
  console.error(`    at   : ${hit.where}`);
  console.error(`    text : ${hit.sample}\n`);
}
console.error('Fix the emit site in clio-agent. Do NOT restore the client filter (#832/#880).');
process.exit(1);
