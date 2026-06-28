/**
 * Chat topbar: session crumbs, model/permission controls and status chips.
 * Exports {@link ChatTopbar}.
 */
import { Show, type JSX } from 'solid-js';
import { Icon } from '../components/Icon.js';
import { NotificationCenter } from '../components/NotificationCenter.js';
import type { RunningTool } from '../live.js';
import type { TopbarOverflowController } from './chatTopbarOverflow.js';
import { runningToolsChipSummary } from './ChatTopbarModel.js';

export interface ChatTopbarProps {
  overflow: TopbarOverflowController;
  activeId: string;
  activeTitle?: string;
  activeStatus?: string;
  renamed: boolean;
  showSessionsColumn: boolean;
  sseStatus?: 'connecting' | 'open' | 'closed' | 'error' | 'reconnecting';
  sseReconnectInSec?: number;
  runningTools?: RunningTool[];
  previewOpen: boolean;
  inspectorOpen: boolean;
  renderSecondaryChips: () => JSX.Element;
  onToggleSessions: () => void;
  onTogglePreview: () => void;
  onToggleInspector: () => void;
}

export function ChatTopbar(props: ChatTopbarProps) {
  const topbarNarrow = props.overflow.narrow;
  const overflowOpen = props.overflow.overflowOpen;
  const setOverflowOpen = props.overflow.setOverflowOpen;

  return (
    <header class="chat__topbar" ref={props.overflow.setTopbarRef}>
      <div class="chat__crumbs" ref={props.overflow.setCrumbsRef}>
        <button
          type="button"
          class="chat__iconbtn chat__sidebar-open"
          title={props.showSessionsColumn ? 'Hide sessions' : 'Show sessions'}
          aria-label={props.showSessionsColumn ? 'Hide sessions' : 'Show sessions'}
          data-testid="topbar-sessions"
          onClick={props.onToggleSessions}
        >
          <Icon name="menu" size={15} />
        </button>
        <span
          class="chat__crumb chat__crumb-head"
          title={props.activeId ? `Session ${props.activeId} — click to copy` : 'No session'}
          onClick={() => {
            if (!props.activeId || typeof navigator === 'undefined') return;
            if (navigator.clipboard) {
              void navigator.clipboard.writeText(props.activeId);
            }
          }}
          style="cursor: pointer"
        >
          {props.activeTitle ?? 'No session'}
        </span>
        <Show when={props.renamed}>
          <span
            class="chat__rename-pill"
            data-testid="chat-renamed-pill"
            title="The backend just updated this session's title"
          >
            renamed
          </span>
        </Show>
      </div>
      <div class="chat__meta" ref={props.overflow.setMetaRef}>
        <Show when={props.activeStatus === 'waiting_permission'}>
          <span
            class="chat__meta-item chat__meta-item--warn"
            data-testid="session-status-chip"
            title="Session is paused waiting for your approval on a tool call"
          >
            waiting · permission
          </span>
        </Show>
        <Show when={props.activeStatus === 'error'}>
          <span
            class="chat__meta-item chat__meta-item--err"
            data-testid="session-status-chip"
            title="Session entered an error state"
          >
            session · error
          </span>
        </Show>
        <Show when={(props.runningTools?.length ?? 0) > 0}>
          {(() => {
            const summary = runningToolsChipSummary(props.runningTools ?? []);
            if (!summary) return null;
            return (
              <span
                class="chat__meta-item chat__meta-item--running"
                data-testid="running-tools-chip"
                title={summary.title}
              >
                <span class="chat__running-dot" aria-hidden />
                running · {summary.visibleNames}
                <Show when={summary.progressPercent != null}> {summary.progressPercent}%</Show>
                <Show when={summary.overflowCount > 0}>
                  {' +'}
                  {summary.overflowCount}
                </Show>
              </span>
            );
          })()}
        </Show>
        <div
          ref={props.overflow.setSecondaryRef}
          class={'chat__secondary' + (topbarNarrow() ? ' chat__secondary--collapsed' : '')}
          aria-hidden={topbarNarrow()}
        >
          {props.renderSecondaryChips()}
        </div>
        <Show when={topbarNarrow()}>
          <div class="chat__overflow-anchor">
            <button
              type="button"
              class={
                'chat__meta-item chat__meta-item--clickable' + (overflowOpen() ? ' is-active' : '')
              }
              data-testid="topbar-overflow"
              title="More session info"
              aria-expanded={overflowOpen()}
              onClick={() => setOverflowOpen((open) => !open)}
            >
              ⋯
            </button>
            <Show when={overflowOpen()}>
              <div class="chat__overflow-menu" data-testid="topbar-overflow-menu" role="menu">
                {props.renderSecondaryChips()}
              </div>
            </Show>
          </div>
        </Show>
      </div>
      <div class="chat__topbar-actions" ref={props.overflow.setActionsRef}>
        <NotificationCenter />
        <button
          type="button"
          class={'chat__iconbtn ' + (props.previewOpen ? 'is-active' : '')}
          title="Toggle file preview rail"
          onClick={props.onTogglePreview}
          data-testid="topbar-preview"
        >
          <Icon name="folder" size={14} />
        </button>
        <button
          type="button"
          class={'chat__iconbtn ' + (props.inspectorOpen ? 'is-active' : '')}
          title="Toggle inspector"
          onClick={props.onToggleInspector}
          data-testid="topbar-inspector"
        >
          <Icon name="panel-right" size={14} />
        </button>
      </div>
    </header>
  );
}
