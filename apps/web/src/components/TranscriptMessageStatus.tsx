/**
 * Renders a message's status line (streaming, completed, stopped, errored) and
 * its stop-reason / token summary in the transcript.
 */
import { Show } from 'solid-js';
import type { Message } from '@clio/core';
import { Icon } from './Icon.js';
import { errorPresentation, formatRetryAfter, hasAutoRetryHint } from './errorTaxonomy.js';

export function MessageStatusPanels(props: {
  msg: Message;
  isAssistant: boolean;
  onRegenerate?: (msg: Message) => void;
}) {
  return (
    <>
      <Show when={isBlocked(props.msg)}>
        <div class="trx-msg__blocked" data-testid={`msg-blocked-${props.msg.id}`} role="alert">
          <span class="trx-msg__blocked-icon">
            <Icon name="alert" size={14} />
          </span>
          <div class="trx-msg__blocked-body">
            <div class="trx-msg__blocked-title">
              Turn blocked
              <Show when={props.msg.error_info?.error}>
                <span class="trx-msg__blocked-kind">{props.msg.error_info!.error}</span>
              </Show>
            </div>
            <Show when={props.msg.error_info?.message}>
              <div class="trx-msg__blocked-detail">{props.msg.error_info!.message}</div>
            </Show>
          </div>
        </div>
      </Show>
      <Show when={isErrored(props.msg) && !isBlocked(props.msg)}>
        {(() => {
          const pres = () => errorPresentation(props.msg.error_info?.error);
          return (
            <div
              class={`trx-msg__error trx-msg__error--${pres().tone}`}
              data-testid={`msg-error-${props.msg.id}`}
              data-error-tone={pres().tone}
              data-error-code={props.msg.error_info?.error ?? ''}
              role="alert"
            >
              <span class="trx-msg__error-icon">
                <Icon name={pres().icon} size={14} />
              </span>
              <div class="trx-msg__error-body">
                <div class="trx-msg__error-title">
                  {props.msg.error_info ? pres().label : 'Turn failed'}
                </div>
                <Show when={props.msg.error_info?.message}>
                  <div class="trx-msg__error-detail">{props.msg.error_info!.message}</div>
                </Show>
                <Show when={!props.msg.error_info?.message && props.msg.error_info}>
                  <div class="trx-msg__error-detail">{pres().hint}</div>
                </Show>
                <Show when={props.msg.error_info && hasAutoRetryHint(props.msg.error_info)}>
                  <div
                    class="trx-msg__error-autoretry"
                    data-testid={`msg-error-autoretry-${props.msg.id}`}
                  >
                    <Icon name="refresh" size={12} />
                    {formatRetryAfter(props.msg.error_info!.retry_after_s as number)}
                  </div>
                </Show>
                <Show
                  when={props.msg.error_info?.recoverable && props.isAssistant && props.onRegenerate}
                >
                  <button
                    type="button"
                    class="trx-msg__error-retry"
                    onClick={() => props.onRegenerate?.(props.msg)}
                    data-testid={`msg-error-retry-${props.msg.id}`}
                  >
                    <Icon name="regenerate" size={12} /> Retry
                  </button>
                </Show>
              </div>
            </div>
          );
        })()}
      </Show>
    </>
  );
}

function isErrored(msg: Message): boolean {
  return msg.stop_reason === 'error' || !!msg.error_info;
}

function isBlocked(msg: Message): boolean {
  return msg.stop_reason === 'blocked' && !!msg.error_info;
}
