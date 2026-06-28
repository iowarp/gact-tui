/**
 * Renders the subagent call/result transcript parts. Exports
 * {@link SubagentCallPartView} and {@link SubagentResultPartView}.
 */
import { Show } from 'solid-js';
import type { PartSubagentCall, PartSubagentResult } from '@clio/core';
import { Icon } from './Icon.js';
import { PartCard } from './TranscriptPartCard.js';

/**
 * clio delegated a turn to a sub-session agent (SPEC §4.5 subagent_call). The
 * TUI indents the delegated sub-turn under a `└` connector; the web replaces
 * the glyph with a real left-rail (see 07-tui-vs-web-semantics) and shows the
 * target agent + the delegated prompt.
 */
export function SubagentCallPartView(props: { part: PartSubagentCall }) {
  const p = props.part;
  return (
    <PartCard
      variant="subagent"
      class="trx-subagent--call"
      testId="trx-subagent-call"
      icon="bot"
      iconSize={12}
      layout="iconInHead"
      head={
        <>
          <span class="trx-subagent__label">
            delegated to <strong>{p.agent_id || 'sub-agent'}</strong>
          </span>
          <Show when={p.subsession_id}>
            <span class="trx-subagent__sid" title="child session id">
              {p.subsession_id}
            </span>
          </Show>
        </>
      }
    >
      <Show when={p.prompt}>
        <p class="trx-subagent__prompt" data-testid="trx-subagent-prompt">
          {p.prompt}
        </p>
      </Show>
    </PartCard>
  );
}

/**
 * The companion result when a delegated sub-session finishes (SPEC §4.5
 * subagent_result). Shows the summary and, when present, a link to the
 * sub-session's final message so the user can jump into the delegated turn.
 */
export function SubagentResultPartView(props: { part: PartSubagentResult }) {
  const p = props.part;
  return (
    <PartCard
      variant="subagent"
      class="trx-subagent--result"
      testId="trx-subagent-result"
      icon="check"
      iconSize={12}
      layout="iconInHead"
      head={<span class="trx-subagent__label">sub-agent returned</span>}
    >
      <Show when={p.summary}>
        <p class="trx-subagent__summary" data-testid="trx-subagent-summary">
          {p.summary}
        </p>
      </Show>
      <Show when={p.final_message_id}>
        <a
          class="trx-subagent__link"
          href={`#msg-${p.final_message_id}`}
          data-testid="trx-subagent-final-link"
        >
          <Icon name="arrow-up-right" size={11} /> final message
        </a>
      </Show>
    </PartCard>
  );
}
