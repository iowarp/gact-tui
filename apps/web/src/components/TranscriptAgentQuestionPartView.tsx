/**
 * Renders an `agent_question` transcript part (an orchestrator ask-user
 * question inline in the feed). Exports {@link AgentQuestionPartView}.
 */
import { For, Show } from 'solid-js';
import type { PartAgentQuestion } from '@clio/core';
import { Icon } from './Icon.js';
import { PartCard } from './TranscriptPartCard.js';

/**
 * Inline ask-user prompt embedded in the transcript (SPEC §4.5 agent_question).
 * The live answer lifecycle arrives via the `user_question.*` SSE events and is
 * answered through the UserQuestionCard surface; this inline part records that
 * an ask happened and links to the live answer card (data-testid
 * `user-question-<id>`) so the user can jump to it.
 */
export function AgentQuestionPartView(props: { part: PartAgentQuestion }) {
  const p = props.part;
  const q = () => p.question;
  const answered = () => {
    const s = q()?.status;
    return s === 'answered' || s === 'resolved';
  };
  return (
    <PartCard
      variant="agentq"
      testId="trx-agent-question"
      icon="help"
      head={
        <>
          <span class="trx-agentq__eyebrow">agent asked a question</span>
          <Show when={q()?.status}>
            <span
              class="trx-agentq__chip"
              classList={{ 'trx-agentq__chip--answered': answered() }}
            >
              {q()!.status}
            </span>
          </Show>
        </>
      }
    >
      <Show when={q()?.prompt}>
        <p class="trx-agentq__prompt">{q()!.prompt}</p>
      </Show>
      <Show when={(q()?.choices?.length ?? 0) > 0}>
        <ul class="trx-agentq__choices">
          <For each={q()!.choices}>{(c) => <li class="trx-agentq__choice">{c}</li>}</For>
        </ul>
      </Show>
      <Show when={q()?.id}>
        <a
          class="trx-agentq__link"
          href={`#user-question-${q()!.id}`}
          data-testid="trx-agent-question-link"
        >
          <Icon name="arrow-up-right" size={11} /> answer this question
        </a>
      </Show>
    </PartCard>
  );
}
