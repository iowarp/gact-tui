/**
 * Inspector 'Attempts' tab: lists a turn's retry attempts. Exports
 * {@link AttemptsTab}.
 */
import { For, Show } from 'solid-js';
import type { TurnAttempt } from '@clio/core';
import { formatTime } from '../formatters.js';
import { attemptTone } from '../statusTones.js';

export interface AttemptsTabProps {
  attempts: TurnAttempt[];
}

export function AttemptsTab(props: AttemptsTabProps) {
  return (
    <section class="inspector__sect" data-testid="inspector-attempts">
      <div class="inspector__sect-title">Retry attempts ({props.attempts.length})</div>
      <ul class="inspector__attempts">
        <For each={props.attempts}>
          {(attempt) => (
            <li
              class={'inspector__attempt inspector__attempt--' + attempt.status}
              data-testid={`inspector-attempt-${attempt.id}`}
            >
              <div class="inspector__attempt-head">
                <span
                  class={'inspector__chip inspector__chip--' + attemptTone(attempt.status)}
                >
                  {attempt.status}
                </span>
                <Show when={attempt.model?.model_id}>
                  <span class="inspector__attempt-model">{attempt.model!.model_id}</span>
                </Show>
                <Show when={attempt.created_at}>
                  <span class="inspector__attempt-when">
                    {formatTime(attempt.created_at)}
                  </span>
                </Show>
              </div>
              <Show when={attempt.notes}>
                <div class="inspector__attempt-notes" data-testid={`attempt-notes-${attempt.id}`}>
                  {attempt.notes}
                </div>
              </Show>
              <Show when={attempt.warning}>
                <div class="inspector__attempt-warning">{attempt.warning}</div>
              </Show>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}
