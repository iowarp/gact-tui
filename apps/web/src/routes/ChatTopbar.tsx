/**
 * Chat topbar: brand, session identity, and chrome actions.
 * Exports {@link ChatTopbar}.
 */
import { Show, type JSX } from 'solid-js';
import { brand } from '@brand';
import { Icon } from '../components/Icon.js';
import { NotificationCenter } from '../components/NotificationCenter.js';
import type { RunningTool } from '../live.js';
import type { TopbarOverflowController } from './chatTopbarOverflow.js';

export interface ChatTopbarProps {
  overflow: TopbarOverflowController;
  activeId: string;
  activeTitle?: string;
  activeBlueprint?: string;
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
  void props.activeStatus;
  void props.renamed;
  void props.showSessionsColumn;
  void props.sseStatus;
  void props.sseReconnectInSec;
  void props.runningTools;
  void props.renderSecondaryChips;
  void props.onToggleSessions;

  const shortTitle = () => clipEnd(props.activeTitle?.trim() || 'No session', 28);
  const blueprint = () => clipEnd(props.activeBlueprint?.trim() || '', 22);

  return (
    <header class="chat__topbar" ref={props.overflow.setTopbarRef}>
      <div class="chat__crumbs" ref={props.overflow.setCrumbsRef}>
        <div class="chat__brand-mark" aria-label={brand.name}>
          <Show
            when={brand.logoImage}
            fallback={
              <Show when={brand.logoSvg} fallback={<span>{brand.markGlyph}</span>}>
                <span innerHTML={brand.logoSvg ?? ''} />
              </Show>
            }
          >
            {(src) => <img src={src()} alt="" />}
          </Show>
        </div>
      </div>

      <button
        type="button"
        class="chat__session-title"
        title={
          props.activeId
            ? `${props.activeTitle ?? props.activeId}${props.activeBlueprint ? ` / ${props.activeBlueprint}` : ''} - click to copy session id`
            : 'No session'
        }
        onClick={() => {
          if (!props.activeId || typeof navigator === 'undefined') return;
          if (navigator.clipboard) void navigator.clipboard.writeText(props.activeId);
        }}
      >
        <span class="chat__session-name">{shortTitle()}</span>
        <Show when={blueprint()}>
          <span class="chat__session-sep">/</span>
          <span class="chat__session-blueprint">{blueprint()}</span>
        </Show>
      </button>

      <div class="chat__topbar-measure" ref={props.overflow.setMetaRef} aria-hidden />

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

function clipEnd(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}...`;
}
