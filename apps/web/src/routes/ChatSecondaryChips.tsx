/**
 * Secondary status chip row under the topbar (running tools, stream stats,
 * cost). Exports {@link ChatSecondaryChips}.
 */
import { Show } from 'solid-js';
import type { ModelOption, PermissionMode } from '../components/ComposerTypes.js';
import { formatCostUsd, formatDurationSeconds } from '../formatters.js';
import { Icon } from '../components/Icon.js';
import type { StreamStats } from '../live.js';
import { humanTokens } from './chatScreenUtils.js';
import type { SettingsSection } from './SettingsShell.js';

export interface ChatSecondaryChipsProps {
  sessionCostUsd?: number;
  sessionTokens?: { input?: number; output?: number; total?: number };
  lastStopReason?: string;
  streamStats?: StreamStats | null;
  selectedModelId?: string;
  models?: ModelOption[];
  permMode?: PermissionMode;
  onOpenSettings?: (section?: SettingsSection) => void;
  onPickPermMode?: (mode: PermissionMode) => void | Promise<void>;
}

export function ChatSecondaryChips(props: ChatSecondaryChipsProps) {
  return (
    <>
      <Show when={(props.sessionCostUsd ?? 0) > 0}>
        <span class="chat__meta-item chat__meta-item--cost" data-testid="session-cost-chip">
          ${formatCostUsd(props.sessionCostUsd ?? 0)}
        </span>
      </Show>
      <Show
        when={
          (props.sessionTokens?.total ?? 0) > 0 ||
          (props.sessionTokens?.input ?? 0) + (props.sessionTokens?.output ?? 0) > 0
        }
      >
        <span class="chat__meta-item" data-testid="tokens-chip">
          {humanTokens(props.sessionTokens)}
        </span>
      </Show>
      <Show when={props.lastStopReason}>
        <span
          class={
            'chat__meta-item ' + (props.lastStopReason === 'error' ? 'chat__meta-item--err' : '')
          }
          data-testid="stop-reason-chip"
        >
          {props.lastStopReason}
        </span>
      </Show>
      <Show
        when={
          props.streamStats &&
          (props.streamStats.ttftMs != null || props.streamStats.tokensPerSec != null)
        }
      >
        <span
          class="chat__meta-item"
          data-testid="stream-stats-chip"
          title="Time-to-first-token · output token rate of the most recent turn"
        >
          <Show when={props.streamStats?.ttftMs != null}>
            ttft {formatDurationSeconds(props.streamStats?.ttftMs ?? 0)}s
          </Show>
          <Show when={props.streamStats?.ttftMs != null && props.streamStats?.tokensPerSec != null}>
            {' · '}
          </Show>
          <Show when={props.streamStats?.tokensPerSec != null}>
            ~{props.streamStats?.tokensPerSec} tok/s
          </Show>
        </span>
      </Show>
      <Show when={props.selectedModelId && props.models?.length}>
        {(() => {
          const model = props.models!.find((candidate) => candidate.id === props.selectedModelId);
          if (!model) return null;
          return (
            <button
              type="button"
              class="chat__meta-item chat__meta-item--model chat__meta-item--clickable"
              data-testid="model-chip"
              title={`${model.providerLabel} · ${model.modelId} — click for Settings → Models`}
              onClick={() => props.onOpenSettings?.('providers')}
            >
              <Icon name="sparkle" size={10} />
              {model.modelId}
            </button>
          );
        })()}
      </Show>
      <Show when={props.permMode && props.permMode !== 'ask'}>
        <button
          type="button"
          class={
            'chat__meta-item chat__meta-item--clickable chat__meta-item--' +
            (props.permMode === 'bypass' || props.permMode === 'auto' ? 'err' : 'warn')
          }
          title={`Permission mode: ${props.permMode} — click to change`}
          onClick={() => void props.onPickPermMode?.('ask')}
          data-testid="perm-mode-chip"
        >
          perm · {props.permMode}
        </button>
      </Show>
    </>
  );
}
