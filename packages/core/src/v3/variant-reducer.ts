import type { UserQuestion } from './domain.js';
import type {
  VariantQuestion,
  VariantRun,
  VariantTry,
  VariantTryActivity,
} from './variant-domain.js';
import {
  variantQuestionMetadataSchema,
  variantSelectedSchema,
  variantTryDeltaSchema,
  variantTryUpsertSchema,
  type VariantSelected,
  type VariantSemanticEvent,
  type VariantTryDelta,
  type VariantTryUpsert,
} from './variant-schemas.js';

/**
 * Pure projections of a variant run's frames onto `EntityState.variant_runs`.
 *
 * The live reducer and the reload path (`variantRunsFromTrace`, over the
 * durable semantic trace and the session's questions) apply the same functions,
 * so a block rendered after a reload is the block the live stream built.
 */
export type VariantRuns = Record<string, VariantRun>;

/** Activity rows kept per try; a try's step log is a summary, not the trace. */
const MAX_TRY_ACTIVITY = 200;
const DRAFT_TOOL = 'draft_alternatives';

type RunFields = Pick<
  VariantRun,
  'variants_id' | 'session_id' | 'run_id' | 'agent_id' | 'origin' | 'strategy' | 'judge' | 'n'
>;

function runWith(existing: VariantRun | undefined, fields: RunFields): VariantRun {
  if (!existing) return { ...fields, tries: [], questions: [] };
  return {
    ...existing,
    session_id: existing.session_id || fields.session_id,
    // The run belongs where it STARTED: a Refine round resumed in a later turn
    // keeps its block at the first turn.
    run_id: existing.run_id ?? fields.run_id,
    agent_id: fields.agent_id || existing.agent_id,
    origin: fields.origin === 'unknown' ? existing.origin : fields.origin,
    strategy: fields.strategy === 'unknown' ? existing.strategy : fields.strategy,
    judge: fields.judge === 'unknown' ? existing.judge : fields.judge,
    n: Math.max(fields.n, existing.n),
  };
}

function withTry(run: VariantRun, next: VariantTry): VariantRun {
  const tries = run.tries.filter((candidate) => candidate.try_index !== next.try_index);
  tries.push(next);
  tries.sort((left, right) => left.try_index - right.try_index);
  return { ...run, tries };
}

function tryAt(run: VariantRun | undefined, index: number): VariantTry | undefined {
  return run?.tries.find((candidate) => candidate.try_index === index);
}

function emptyTry(variantsId: string, index: number): VariantTry {
  return {
    id: `${variantsId}:${index}`,
    variants_id: variantsId,
    try_index: index,
    scope: '',
    state: 'running',
    text: '',
    thinking: '',
    activity: [],
  };
}

/** A try started, ended (text, tokens, score), failed, or was scored. */
export function upsertVariantTry(runs: VariantRuns, payload: VariantTryUpsert): VariantRuns {
  const run = runWith(runs[payload.variants_id], payload);
  const previous =
    tryAt(run, payload.try_index) ?? emptyTry(payload.variants_id, payload.try_index);
  const next: VariantTry = {
    ...previous,
    id: payload.id || previous.id,
    scope: payload.scope || previous.scope,
    state: payload.state,
    // A completed try's text is authoritative; a running upsert keeps the stream.
    text: payload.text ?? previous.text,
    run_id: previous.run_id ?? payload.run_id,
    score: payload.score ?? previous.score,
    tokens: payload.tokens ?? previous.tokens,
    error: payload.error ?? previous.error,
    forked_from: payload.forked_from ?? previous.forked_from,
    advice: payload.advice ?? previous.advice,
  };
  return { ...runs, [run.variants_id]: withTry(run, next) };
}

/**
 * The try's live text or thinking. `undefined` when the try is not resident
 * (its start predates this client's stream), so the caller can record the gap.
 * A delta after the try ended is stale: the completed text already holds it.
 */
export function appendVariantDelta(
  runs: VariantRuns,
  delta: VariantTryDelta,
): VariantRuns | undefined {
  const run = runs[delta.variants_id];
  const current = tryAt(run, delta.try_index);
  if (!run || !current) return undefined;
  if (current.state !== 'running') return runs;
  const next =
    delta.kind === 'thinking'
      ? { ...current, thinking: current.thinking + delta.delta }
      : { ...current, text: current.text + delta.delta };
  return { ...runs, [run.variants_id]: withTry(run, next) };
}

/** The selection: the judge's scores or the user's pick and comment. */
export function selectVariant(runs: VariantRuns, selected: VariantSelected): VariantRuns {
  let run = runWith(runs[selected.variants_id], selected);
  const scores = selected.scores.flatMap((row) =>
    row.score === undefined ? [] : [{ try_index: row.try_index, score: row.score }],
  );
  for (const row of scores) {
    const current = tryAt(run, row.try_index);
    if (current && current.score === undefined)
      run = withTry(run, { ...current, score: row.score });
  }
  const chosen = tryAt(run, selected.selected_index);
  if (chosen && !chosen.text && selected.text)
    run = withTry(run, { ...chosen, text: selected.text });
  return {
    ...runs,
    [run.variants_id]: {
      ...run,
      selection: {
        selected_index: selected.selected_index,
        selected_scope: selected.selected_scope,
        text: selected.text,
        scores,
        winning_score: selected.winning_score,
        pick: selected.pick,
        comment: selected.comment,
      },
    },
  };
}

/** The agent id a draft id (`<agent>#run<k>`) names. */
function agentOfDraft(id: string): string {
  const marker = id.lastIndexOf('#run');
  return marker > 0 ? id.slice(0, marker) : '';
}

/**
 * A pick question (`metadata.variant`) joins its run. `undefined` when the
 * question is not a variant question. The candidates' final texts also seed
 * tries this client never saw run (a reload with no durable trace).
 */
export function attachVariantQuestion(
  runs: VariantRuns,
  question: UserQuestion,
): VariantRuns | undefined {
  const parsed = variantQuestionMetadataSchema.safeParse(question.metadata ?? {});
  if (!parsed.success) return undefined;
  const { variants_id: variantsId, tool_name: toolName, variant } = parsed.data;
  const record: VariantQuestion = {
    id: question.id,
    session_id: question.session_id,
    status: question.status,
    prompt: question.prompt,
    rubric: variant.rubric,
    refinable: variant.refinable,
    candidates: variant.candidates,
    selected_options: question.selected_options ?? [],
    answer: question.answer,
    created_at: question.created_at,
  };
  let run = runWith(runs[variantsId], {
    variants_id: variantsId,
    session_id: question.session_id,
    run_id: undefined,
    agent_id: agentOfDraft(variant.candidates[0]?.id ?? ''),
    origin: toolName === DRAFT_TOOL ? 'draft_alternatives' : 'unknown',
    strategy: variant.strategy,
    judge: variant.judge,
    n: variant.n,
  });
  for (const candidate of variant.candidates) {
    const current = tryAt(run, candidate.try_index);
    if (!current) {
      run = withTry(run, {
        ...emptyTry(variantsId, candidate.try_index),
        scope: candidate.id,
        state: 'completed',
        text: candidate.text,
      });
    } else if (!current.scope || (current.state !== 'running' && !current.text)) {
      run = withTry(run, {
        ...current,
        scope: current.scope || candidate.id,
        text: current.text || candidate.text,
      });
    }
  }
  const questions = [...run.questions.filter((item) => item.id !== record.id), record].sort(
    (left, right) => left.created_at.localeCompare(right.created_at),
  );
  return { ...runs, [variantsId]: { ...run, questions } };
}

/** The `(variants_id, try_index)` stamp a try's other semantic events carry. */
function tryStamp(
  payload: Record<string, unknown>,
): { variantsId: string; index: number } | undefined {
  const variantsId = payload.variants_id;
  const index = payload.try_index;
  if (typeof variantsId !== 'string' || !variantsId) return undefined;
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) return undefined;
  return { variantsId, index };
}

/**
 * A semantic event a try emitted (its steps, tool calls) goes to the try's
 * activity, never the turn's. `undefined` when the event is not stamped or
 * its try is not resident.
 */
export function recordVariantActivity(
  runs: VariantRuns,
  event: VariantSemanticEvent,
): VariantRuns | undefined {
  if (event.event_type.startsWith('variant.')) return undefined;
  const stamp = tryStamp(event.payload);
  if (!stamp) return undefined;
  const run = runs[stamp.variantsId];
  const current = tryAt(run, stamp.index);
  if (!run || !current) return undefined;
  const row: VariantTryActivity = {
    event_type: event.event_type,
    summary: event.summary,
    status: event.status,
    occurred_at: event.occurred_at,
  };
  const activity = [...current.activity, row].slice(-MAX_TRY_ACTIVITY);
  return { ...runs, [run.variants_id]: withTry(run, { ...current, activity }) };
}

/**
 * Folds durable semantic events (oldest first) and the session's questions
 * into variant runs -- the reload twin of the live frames. A row this version
 * cannot read is skipped, never raised: the trace is a read model.
 */
export function variantRunsFromTrace(
  events: readonly VariantSemanticEvent[],
  questions: readonly UserQuestion[],
  sessionId: string,
): VariantRuns {
  let runs: VariantRuns = {};
  for (const event of events) {
    const inner = event.payload;
    const stamp = tryStamp(inner);
    const base = {
      ...inner,
      session_id: event.session_id ?? sessionId,
      run_id: event.turn_id,
    };
    if (event.event_type === 'variant.try' && stamp) {
      const parsed = variantTryUpsertSchema.safeParse({
        ...base,
        id: `${stamp.variantsId}:${stamp.index}`,
        state: inner.status ?? event.status,
      });
      if (parsed.success) runs = upsertVariantTry(runs, parsed.data);
    } else if (event.event_type === 'variant.try.delta' && stamp) {
      const parsed = variantTryDeltaSchema.safeParse({
        ...inner,
        id: `${stamp.variantsId}:${stamp.index}`,
      });
      if (parsed.success) runs = appendVariantDelta(runs, parsed.data) ?? runs;
    } else if (event.event_type === 'variant.selected') {
      const parsed = variantSelectedSchema.safeParse(base);
      if (parsed.success) runs = selectVariant(runs, parsed.data);
    } else {
      runs = recordVariantActivity(runs, event) ?? runs;
    }
  }
  for (const question of questions) runs = attachVariantQuestion(runs, question) ?? runs;
  return runs;
}

function mergeTry(live: VariantTry, persisted: VariantTry): VariantTry {
  return {
    ...persisted,
    ...live,
    scope: live.scope || persisted.scope,
    text: live.text || persisted.text,
    thinking: live.thinking || persisted.thinking,
    run_id: persisted.run_id ?? live.run_id,
    score: live.score ?? persisted.score,
    tokens: live.tokens ?? persisted.tokens,
    error: live.error ?? persisted.error,
    forked_from: live.forked_from ?? persisted.forked_from,
    advice: live.advice ?? persisted.advice,
    activity: live.activity.length ? live.activity : persisted.activity,
  };
}

function mergeRun(live: VariantRun, persisted: VariantRun): VariantRun {
  const tries = new Map(persisted.tries.map((item) => [item.try_index, item]));
  for (const item of live.tries) {
    const earlier = tries.get(item.try_index);
    tries.set(item.try_index, earlier ? mergeTry(item, earlier) : item);
  }
  const questions = new Map(persisted.questions.map((item) => [item.id, item]));
  for (const item of live.questions) questions.set(item.id, item);
  return {
    ...runWith(persisted, live),
    run_id: persisted.run_id ?? live.run_id,
    tries: [...tries.values()].sort((left, right) => left.try_index - right.try_index),
    selection: live.selection ?? persisted.selection,
    questions: [...questions.values()].sort((left, right) =>
      left.created_at.localeCompare(right.created_at),
    ),
  };
}

/**
 * Merges runs read from the durable trace into the live ones. What the live
 * stream wrote wins field by field; the trace fills what this client never
 * saw (tries started before its stream, the start turn, earlier questions).
 */
export function mergeVariantRuns(live: VariantRuns, persisted: VariantRuns): VariantRuns {
  const merged: VariantRuns = { ...persisted };
  for (const [id, run] of Object.entries(live)) {
    const earlier = persisted[id];
    merged[id] = earlier ? mergeRun(run, earlier) : run;
  }
  return merged;
}
