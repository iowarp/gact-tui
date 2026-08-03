/**
 * Secondary status chip row under the topbar.
 * Exports {@link ChatSecondaryChips}.
 */
import { Show } from 'solid-js';
import type { ModelOption, PermissionMode } from '../components/ComposerTypes.js';
import { formatCostUsd } from '../formatters.js';
import type { StreamStats } from '../live.js';
import { humanTokens } from './chatScreenUtils.js';
import type { SettingsSection } from './SettingsShell.js';

export interface ChatSecondaryChipsProps {
  sessionCostUsd?: number;
  sessionTokens?: { input?: number; output?: number; total?: number };
  streamStats?: StreamStats | null;
  selectedModelId?: string;
  models?: ModelOption[];
  permMode?: PermissionMode;
  onOpenSettings?: (section?: SettingsSection) => void;
  onPickPermMode?: (mode: PermissionMode) => void | Promise<void>;
}

export function ChatSecondaryChips(props: ChatSecondaryChipsProps) {
  const ttftMs = () => props.streamStats?.ttftMs;
  const tokensPerSec = () => props.streamStats?.tokensPerSec;
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
      <Show when={ttftMs() != null}>
        <span class="chat__meta-item" data-testid="stream-stats-chip">
          {Math.round(ttftMs() ?? 0)}ms TTFT
          <Show when={tokensPerSec() != null}>
            {` · ${Math.round(tokensPerSec() ?? 0)} tok/s`}
          </Show>
        </span>
      </Show>
      <Show when={props.permMode && props.permMode !== 'ask'}>
        <button
          type="button"
          class={
            'chat__meta-item chat__meta-item--clickable chat__meta-item--' +
            (props.permMode === 'bypass' || props.permMode === 'auto' ? 'err' : 'warn')
          }
          title={`Permission mode: ${props.permMode} - click to change`}
          onClick={() => void props.onPickPermMode?.('ask')}
          data-testid="perm-mode-chip"
        >
          perm - {props.permMode}
        </button>
      </Show>
    </>
  );
}
