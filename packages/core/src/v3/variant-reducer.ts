import type { VariantRun, VariantTry, VariantTryActivity } from './variant-domain.js';
import type {
  VariantRunRecord,
  VariantSelected,
  VariantSemanticEvent,
  VariantTryDelta,
  VariantTryUpsert,
} from './variant-schemas.js';

/**
 * Pure projections of a variant run's frames onto `EntityState.variant_runs`,
 * and of the runs clio-core serves after a reload (`variantRunsFromRecords`),
 * merged under the live ones (`mergeVariantRuns`).
 */
export type VariantRuns = Record<string, VariantRun>;

/** Activity rows kept per try; a try's live step log is a summary, not the trace. */
const MAX_TRY_ACTIVITY = 200;

type RunFields = Pick<
  VariantRun,
  'variants_id' | 'session_id' | 'run_id' | 'agent_id' | 'origin' | 'strategy' | 'judge' | 'n'
>;

function runWith(existing: VariantRun | undefined, fields: RunFields): VariantRun {
  if (!existing) return { ...fields, tries: [] };
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
    steps: [],
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
      status: 'selected',
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
 * The runs clio-core serves (`clio.variant_run.v1`) as variant runs: reload
 * equals live, LM- and user-judged alike, each try with its recorded steps.
 */
export function variantRunsFromRecords(records: readonly VariantRunRecord[]): VariantRuns {
  const runs: VariantRuns = {};
  for (const record of records) {
    const tries = record.tries.map(
      (item): VariantTry => ({
        id: `${record.variants_id}:${item.try_index}`,
        variants_id: record.variants_id,
        try_index: item.try_index,
        scope: item.scope,
        state: item.state,
        text: item.text,
        thinking: '',
        run_id: item.turn_id,
        anchor_message_id: item.anchor_message_id,
        score: item.score,
        tokens: item.tokens,
        error: item.error,
        forked_from: item.forked_from,
        advice: item.advice,
        activity: [],
        steps: item.steps,
      }),
    );
    const chosen =
      record.selected_index === undefined
        ? undefined
        : tries.find((item) => item.try_index === record.selected_index);
    const scores = tries.flatMap((item) =>
      item.score === undefined ? [] : [{ try_index: item.try_index, score: item.score }],
    );
    runs[record.variants_id] = {
      variants_id: record.variants_id,
      session_id: record.session_id,
      run_id: record.turn_id,
      anchor_message_id: record.anchor_message_id,
      agent_id: record.agent_id,
      origin: record.origin,
      strategy: record.strategy,
      judge: record.judge,
      n: record.n,
      status: record.status,
      rubric: record.rubric,
      tries: tries.sort((left, right) => left.try_index - right.try_index),
      selection:
        record.status === 'selected' && chosen
          ? {
              selected_index: chosen.try_index,
              selected_scope: chosen.scope,
              text: chosen.text,
              scores,
              winning_score: chosen.score,
              pick: record.pick,
              comment: record.comment,
            }
          : undefined,
    };
  }
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
    anchor_message_id: persisted.anchor_message_id ?? live.anchor_message_id,
    score: live.score ?? persisted.score,
    tokens: live.tokens ?? persisted.tokens,
    error: live.error ?? persisted.error,
    forked_from: live.forked_from ?? persisted.forked_from,
    advice: live.advice ?? persisted.advice,
    activity: live.activity.length ? live.activity : persisted.activity,
    steps: live.steps.length ? live.steps : persisted.steps,
  };
}

function mergeRun(live: VariantRun, persisted: VariantRun): VariantRun {
  const tries = new Map(persisted.tries.map((item) => [item.try_index, item]));
  for (const item of live.tries) {
    const earlier = tries.get(item.try_index);
    tries.set(item.try_index, earlier ? mergeTry(item, earlier) : item);
  }
  return {
    ...runWith(persisted, live),
    run_id: persisted.run_id ?? live.run_id,
    anchor_message_id: persisted.anchor_message_id ?? live.anchor_message_id,
    status: live.status ?? persisted.status,
    tries: [...tries.values()].sort((left, right) => left.try_index - right.try_index),
    selection: live.selection ?? persisted.selection,
  };
}

/**
 * Merges the runs clio-core served (a reload) into the live ones. What the
 * live stream wrote wins field by field; the record fills what this client
 * never saw (tries started before its stream, the anchors, the steps).
 */
export function mergeVariantRuns(live: VariantRuns, persisted: VariantRuns): VariantRuns {
  const merged: VariantRuns = { ...persisted };
  for (const [id, run] of Object.entries(live)) {
    const earlier = persisted[id];
    merged[id] = earlier ? mergeRun(run, earlier) : run;
  }
  return merged;
}
