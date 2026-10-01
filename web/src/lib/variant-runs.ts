import type {
  Message,
  MessageBlock,
  PendingInteraction,
  VariantQuestion,
  VariantRun,
  VariantTry,
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

function interactionQuestionId(interaction: PendingInteraction): string {
  return interaction.payload?.question_id ?? interaction.id;
}

function isAssistant(message: Message): boolean {
  return message.role === 'assistant';
}

/**
 * The message a run's block belongs to: the first assistant message of the
 * turn the run started in; for a run known only from its pick question, the
 * message holding the tool call that asked it; failing both, the latest
 * assistant message of its session, so a waiting pick is never out of sight.
 */
export function variantRunAnchorId(
  run: VariantRun,
  messages: readonly Message[],
  interactions: readonly PendingInteraction[],
): string | undefined {
  const session = messages.filter(
    (message) => isAssistant(message) && message.session_id === run.session_id,
  );
  if (run.run_id) {
    const turn = session.find(
      (message) => message.turn_id === run.run_id || message.run_id === run.run_id,
    );
    if (turn) return turn.id;
  }
  const questionIds = new Set(run.questions.map((question) => question.id));
  const toolIds = new Set(
    interactions.flatMap((interaction) =>
      questionIds.has(interactionQuestionId(interaction)) && interaction.source.invocation_id
        ? [interaction.source.invocation_id]
        : [],
    ),
  );
  const asked = session.find((message) =>
    message.blocks.some((block) => block.type === 'tool' && toolIds.has(block.tool_id)),
  );
  return (asked ?? session.at(-1))?.id;
}

/** Runs whose block belongs at this message, oldest first. */
export function variantRunsForMessage(
  runs: readonly VariantRun[],
  message: Message,
  messages: readonly Message[],
  interactions: readonly PendingInteraction[],
): VariantRun[] {
  if (!isAssistant(message)) return [];
  const known = messages.some((candidate) => candidate.id === message.id)
    ? messages
    : [...messages, message];
  return runs.filter(
    (run) =>
      run.session_id === message.session_id &&
      run.tries.length > 0 &&
      variantRunAnchorId(run, known, interactions) === message.id,
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
  /** What the try was given (Refine advice), shown as an injection inside the tab. */
  injections: VariantInjection[];
  activity: VariantTry['activity'];
  selected: boolean;
  /** The user picked this try in some round. */
  userPick: boolean;
  /** The comment the user sent with that pick. */
  comment?: string;
  /** The draft id a pick of this tab answers with; absent when it cannot be picked now. */
  candidateId?: string;
}

export interface VariantRunView {
  variantsId: string;
  title: string;
  /** How the run chooses: `Best of 3 · you pick`. */
  method: string;
  status: string;
  tabs: VariantTabView[];
  defaultTab: number;
  /** The question waiting for a pick; absent once the run is decided. */
  question?: VariantQuestion;
  /** The interaction that answers `question`; absent while it is not loaded. */
  interaction?: PendingInteraction;
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

function statusLabel(run: VariantRun, noun: string, question?: VariantQuestion): string {
  if (run.selection) return `${noun} ${run.selection.selected_index + 1} selected`;
  if (question) return 'Waiting for your pick';
  const running = run.tries.filter((item) => item.state === 'running').length;
  if (running > 0) return `${running} of ${run.tries.length} running`;
  if (run.tries.every((item) => item.state === 'failed')) return 'Every try failed';
  return run.judge === 'user' ? 'Waiting for the drafts' : 'Judging the tries';
}

/** The pending pick question's interaction, matched by its question id. */
function pickInteraction(
  question: VariantQuestion | undefined,
  interactions: readonly PendingInteraction[],
): PendingInteraction | undefined {
  if (!question) return undefined;
  return interactions.find(
    (interaction) =>
      interaction.kind === 'question' &&
      interaction.status === 'pending' &&
      interactionQuestionId(interaction) === question.id &&
      (interaction.actions ?? []).includes('answer'),
  );
}

/** The tabs block's presentation of one run: tabs, badges, the pick it waits for. */
export function variantRunView(
  run: VariantRun,
  interactions: readonly PendingInteraction[],
  messages: readonly Message[],
): VariantRunView {
  const noun = tryNoun(run);
  const pending = run.questions.findLast((item) => item.status === 'pending');
  const question = run.selection ? undefined : pending;
  const interaction = pickInteraction(question, interactions);
  const injections = variantInjections(messages, run.variants_id);
  const picks = new Map<string, string | undefined>();
  for (const answered of run.questions) {
    if (answered.status !== 'answered') continue;
    for (const option of answered.selected_options) picks.set(option, answered.answer?.trim());
  }
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
    const pickedInRound = picks.has(item.scope);
    const selectedPick = run.selection?.pick === item.try_index;
    const candidate = question?.candidates.find(
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
      injections: [...advice, ...given],
      activity: item.activity,
      selected: run.selection?.selected_index === item.try_index,
      userPick: pickedInRound || selectedPick,
      comment:
        (selectedPick ? run.selection?.comment : undefined) || picks.get(item.scope) || undefined,
      candidateId: interaction ? candidate?.id : undefined,
    };
  });
  // A pick opens on the newest refined draft (what the comment asked for),
  // otherwise on the first draft offered.
  const candidates = question?.candidates ?? [];
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
    title:
      run.origin === 'draft_alternatives'
        ? 'Alternative drafts'
        : `${run.agent_id || 'Agent'} tries`,
    method: methodLabel(run),
    status: statusLabel(run, noun, question),
    tabs,
    defaultTab,
    question,
    interaction,
    refinable: question?.refinable ?? false,
  };
}
