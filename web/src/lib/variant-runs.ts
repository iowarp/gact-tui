import {
  variantQuestionMetadataSchema,
  type Message,
  type MessageBlock,
  type PendingInteraction,
  type VariantCandidate,
  type VariantClosure,
  type VariantRun,
  type VariantTry,
} from '@clio/core/v3';

/** The tool a main agent drafts alternatives with; its pick question renders as the tabs. */
export const DRAFT_ALTERNATIVES_TOOL = 'draft_alternatives';

export type VariantInjection = Extract<MessageBlock, { type: 'injection' }>;

/** A question asking the user to pick one of the agent's drafts. */
export function isVariantPickInteraction(interaction: PendingInteraction): boolean {
  return (
    interaction.kind === 'question' && interaction.source.tool_name === DRAFT_ALTERNATIVES_TOOL
  );
}

/** A waiting pick, read straight from its interaction's `payload.metadata.variant`. */
export interface VariantPickQuestion {
  interaction: PendingInteraction;
  variantsId: string;
  prompt?: string;
  rubric?: string;
  refinable: boolean;
  candidates: VariantCandidate[];
  /** The pick's deadline (`draft_alternatives`' `expiresInSeconds`), when it has one. */
  expiresAt?: string;
}

/** The pick question an interaction carries, or `undefined` when it is not one. */
export function variantPickQuestion(
  interaction: PendingInteraction,
): VariantPickQuestion | undefined {
  if (interaction.kind !== 'question') return undefined;
  const parsed = variantQuestionMetadataSchema.safeParse(interaction.payload?.metadata);
  if (!parsed.success) return undefined;
  return {
    interaction,
    variantsId: parsed.data.variants_id,
    prompt: interaction.prompt,
    rubric: parsed.data.variant.rubric,
    refinable: parsed.data.variant.refinable,
    candidates: parsed.data.variant.candidates,
    expiresAt: interaction.payload?.expires_at || undefined,
  };
}

/** The run's waiting pick: its newest pending, answerable pick interaction. */
function waitingPick(
  run: VariantRun,
  interactions: readonly PendingInteraction[],
): VariantPickQuestion | undefined {
  return interactions
    .filter(
      (interaction) =>
        interaction.status === 'pending' && (interaction.actions ?? []).includes('answer'),
    )
    .sort((left, right) => left.created_at.localeCompare(right.created_at))
    .map(variantPickQuestion)
    .findLast((question) => question?.variantsId === run.variants_id);
}

/**
 * The message a run's block belongs to:
 * 1. the server's `anchor_message_id` (the assistant message of the run's
 *    turn; the first try's when the run itself has none yet);
 * 2. otherwise its turn (`run_id`: the user message id): the assistant message
 *    carrying that turn, or the first assistant message after that user message;
 *    a turn whose answer is not loaded yet places the block nowhere for now;
 * 3. only a run carrying neither (recorded outside any turn) falls back to the
 *    latest assistant message of its session.
 */
export function variantRunAnchorId(
  run: VariantRun,
  messages: readonly Message[],
): string | undefined {
  const session = messages.filter((message) => message.session_id === run.session_id);
  const anchor =
    run.anchor_message_id ?? run.tries.find((item) => item.anchor_message_id)?.anchor_message_id;
  if (anchor && session.some((message) => message.id === anchor)) return anchor;
  const turn = run.run_id ?? run.tries.find((item) => item.run_id)?.run_id;
  if (turn) {
    const answer = session.find(
      (message) =>
        message.role === 'assistant' && (message.turn_id === turn || message.run_id === turn),
    );
    if (answer) return answer.id;
    const asked = session.findIndex((message) => message.id === turn);
    if (asked < 0) return undefined;
    return session.slice(asked + 1).find((message) => message.role === 'assistant')?.id;
  }
  return session.findLast((message) => message.role === 'assistant')?.id;
}

/** Runs whose block belongs at this message. */
export function variantRunsForMessage(
  runs: readonly VariantRun[],
  message: Message,
  messages: readonly Message[],
): VariantRun[] {
  if (message.role !== 'assistant') return [];
  const known = messages.some((candidate) => candidate.id === message.id)
    ? messages
    : [...messages, message];
  return runs.filter(
    (run) =>
      run.session_id === message.session_id &&
      run.tries.length > 0 &&
      variantRunAnchorId(run, known) === message.id,
  );
}

/** Injection blocks a try received (they carry the try's `variants_id` and `try_index`). */
export function variantInjections(
  messages: readonly Message[],
  variantsId: string,
): Map<number, VariantInjection[]> {
  const byTry = new Map<number, VariantInjection[]>();
  for (const message of messages) {
    for (const block of message.blocks) {
      if (block.type !== 'injection' || block.variants_id !== variantsId) continue;
      if (block.try_index === undefined) continue;
      byTry.set(block.try_index, [...(byTry.get(block.try_index) ?? []), block]);
    }
  }
  return byTry;
}

export interface VariantTabView {
  tryIndex: number;
  /** `Draft 2`, the tab's own name. */
  label: string;
  state: VariantTry['state'];
  text: string;
  thinking: string;
  score?: number;
  tokens?: number;
  error?: string;
  /** The tab this try was refined from. */
  forkedFromLabel?: string;
  /** The Refine advice the try was given. */
  advice?: string;
  /** What the try was given (Refine advice), shown as an injection inside the tab. */
  injections: VariantInjection[];
  activity: VariantTry['activity'];
  /** The try's own recorded steps (after a reload). */
  steps: VariantTry['steps'];
  selected: boolean;
  /** The user picked this try (to accept it, or to refine it with a comment). */
  userPick: boolean;
  /** The comment the user sent with that pick. */
  comment?: string;
  /** The draft id a pick of this tab answers with; absent when it cannot be picked now. */
  candidateId?: string;
}

/** A run that ended without a pick, in plain words. */
export interface VariantClosedView {
  status: VariantClosure['status'];
  /** The short status: `Superseded by your next message`, `Cancelled`, `Expired`. */
  label: string;
  /** What it means for the drafts. */
  notice: string;
  /** The user message that superseded the pick. */
  supersededByMessageId?: string;
}

export interface VariantRunView {
  variantsId: string;
  sessionId: string;
  title: string;
  /** How the run chooses: `Best of 3 · you pick`. */
  method: string;
  status: string;
  tabs: VariantTabView[];
  defaultTab: number;
  /** The pick waiting for the user; absent once the run is decided or closed. */
  pick?: VariantPickQuestion;
  /** The run ended without a pick: read-only, no pick or comment. */
  closed?: VariantClosedView;
  refinable: boolean;
}

function tryNoun(run: VariantRun): string {
  return run.origin === 'draft_alternatives' ? 'Draft' : 'Try';
}

function methodLabel(run: VariantRun): string {
  const strategy =
    run.strategy === 'refine'
      ? `Refine, up to ${run.n} tries`
      : run.n > 0
        ? `Best of ${run.n}`
        : 'Best of several';
  const judge =
    run.judge === 'user' ? 'you pick' : run.judge === 'lm' ? 'judged by the model' : undefined;
  return judge ? `${strategy} · ${judge}` : strategy;
}

/** A closed run's plain status and notice; never a colour or an icon alone. */
export function variantClosedView(closure: VariantClosure): VariantClosedView {
  const unused = 'None of these drafts was used.';
  switch (closure.status) {
    case 'superseded':
      return {
        status: closure.status,
        label: 'Superseded by your next message',
        notice: `You sent a new message instead of picking. ${unused}`,
        supersededByMessageId: closure.superseded_by_message_id,
      };
    case 'cancelled':
      return {
        status: closure.status,
        label: 'Cancelled',
        notice: `The pick was cancelled. ${unused}`,
      };
    case 'expired':
      return {
        status: closure.status,
        label: 'Expired',
        notice: `The time to pick ran out. ${unused}`,
      };
    default:
      return { status: closure.status, label: 'Closed', notice: `The pick closed. ${unused}` };
  }
}

function statusLabel(run: VariantRun, noun: string, pick?: VariantPickQuestion): string {
  if (run.selection) return `${noun} ${run.selection.selected_index + 1} selected`;
  if (run.closure) return variantClosedView(run.closure).label;
  if (pick) return 'Waiting for your pick';
  if (run.status === 'failed') return 'The run failed';
  const running = run.tries.filter((item) => item.state === 'running').length;
  if (running > 0) return `${running} of ${run.tries.length} running`;
  if (run.tries.every((item) => item.state === 'failed')) return 'Every try failed';
  if (run.status === 'awaiting_pick') return 'Waiting for your pick';
  return run.judge === 'user' ? 'Waiting for the drafts' : 'Judging the tries';
}

/** The tabs block's presentation of one run: tabs, badges, the pick it waits for. */
export function variantRunView(
  run: VariantRun,
  interactions: readonly PendingInteraction[],
  messages: readonly Message[],
): VariantRunView {
  const noun = tryNoun(run);
  // A decided or closed run offers no pick, whatever interaction rows remain.
  const pick = run.selection || run.closure ? undefined : waitingPick(run, interactions);
  const injections = variantInjections(messages, run.variants_id);
  // A Refine try forked from a pick: the user picked that try with a comment
  // (its advice). The final pick is the selection's.
  const refinedFrom = new Map(
    run.judge === 'user'
      ? run.tries.flatMap((item) =>
          item.forked_from === undefined ? [] : [[item.forked_from, item.advice] as const],
        )
      : [],
  );
  const tabs = run.tries.map((item): VariantTabView => {
    const given = injections.get(item.try_index) ?? [];
    const advice =
      item.advice && !given.some((block) => block.text === item.advice)
        ? [
            {
              id: `${item.id}:advice`,
              type: 'injection' as const,
              source: 'variant_advice',
              text: item.advice,
              variants_id: run.variants_id,
              try_index: item.try_index,
            },
          ]
        : [];
    const finalPick = run.selection?.pick === item.try_index;
    const candidate = pick?.candidates.find(
      (candidateItem) => candidateItem.try_index === item.try_index,
    );
    return {
      tryIndex: item.try_index,
      label: `${noun} ${item.try_index + 1}`,
      state: item.state,
      text: item.text,
      thinking: item.thinking,
      score: item.score,
      tokens: item.tokens?.total,
      error: item.error,
      forkedFromLabel:
        item.forked_from === undefined ? undefined : `${noun} ${item.forked_from + 1}`,
      advice: item.advice,
      injections: [...advice, ...given],
      activity: item.activity,
      steps: item.steps,
      selected: run.selection?.selected_index === item.try_index,
      userPick: finalPick || refinedFrom.has(item.try_index),
      comment:
        (finalPick ? run.selection?.comment : undefined) ||
        refinedFrom.get(item.try_index) ||
        undefined,
      candidateId: candidate?.id,
    };
  });
  // A pick opens on the newest refined draft (what the comment asked for),
  // otherwise on the first draft offered.
  const candidates = pick?.candidates ?? [];
  const refined = candidates.filter(
    (candidate) =>
      run.tries.find((item) => item.try_index === candidate.try_index)?.forked_from !== undefined,
  );
  const defaultTab =
    run.selection?.selected_index ??
    (refined.at(-1) ?? candidates[0])?.try_index ??
    run.tries.find((item) => item.state === 'running')?.try_index ??
    run.tries[0]?.try_index ??
    0;
  return {
    variantsId: run.variants_id,
    sessionId: run.session_id,
    title:
      run.origin === 'draft_alternatives'
        ? 'Alternative drafts'
        : `${run.agent_id || 'Agent'} tries`,
    method: methodLabel(run),
    status: statusLabel(run, noun, pick),
    tabs,
    defaultTab,
    pick,
    closed: run.closure ? variantClosedView(run.closure) : undefined,
    refinable: pick?.refinable ?? false,
  };
}
