/**
 * Chat topbar: brand, session identity, and chrome actions.
 * Exports {@link ChatTopbar}.
 */
import { For, Show, type JSX } from 'solid-js';
import { brand } from '@brand';
import { presentBlueprintLabel } from '../brand-presentation.js';
import { BrandMark } from '../components/BrandMark.js';
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
  void props.sseStatus;
  void props.sseReconnectInSec;
  void props.runningTools;
  void props.renderSecondaryChips;

  const shortTitle = () => clipEnd(props.activeTitle?.trim() || 'No session', 28);
  const blueprint = () => clipEnd(presentBlueprintLabel(props.activeBlueprint?.trim() || ''), 22);
  const taglineAccent = () => brand.taglineAccent?.trim() || '';
  const taglineParts = () => {
    const accent = taglineAccent();
    if (!accent || !brand.tagline.includes(accent)) {
      return [{ text: brand.tagline, accent: false }];
    }
    const [before = '', after = ''] = brand.tagline.split(accent, 2);
    return [
      { text: before, accent: false },
      { text: accent, accent: true },
      { text: after, accent: false },
    ].filter((part) => part.text.length > 0);
  };

  return (
    <header class="chat__topbar" ref={props.overflow.setTopbarRef}>
      <div class="chat__crumbs" ref={props.overflow.setCrumbsRef}>
        <div class="chat__brand-lockup" aria-label={brand.name}>
          <BrandLink className="chat__brand-mark-link" href={brand.homeUrl}>
            <BrandMark class="chat__brand-mark" useImage />
          </BrandLink>
          <div class="chat__brand-copy">
            <BrandLink className="chat__brand-wordmark" href={brand.homeUrl}>
              <For each={brand.wordmark.split('')}>{(char) => <span>{char}</span>}</For>
            </BrandLink>
            <Show when={brand.tagline}>
              <span class="chat__brand-tagline">
                <For each={taglineParts()}>
                  {(part) => (
                    <Show
                      when={part.accent && brand.taglineAccentUrl}
                      fallback={<span>{part.text}</span>}
                    >
                      <a
                        class="chat__brand-tagline-link"
                        href={brand.taglineAccentUrl ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {part.text}
                      </a>
                    </Show>
                  )}
                </For>
              </span>
            </Show>
          </div>
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
        <button
          type="button"
          class={'chat__iconbtn ' + (props.showSessionsColumn ? 'is-active' : '')}
          title="Toggle sessions column"
          onClick={props.onToggleSessions}
          data-testid="topbar-sessions"
        >
          <Icon name="panel-left" size={14} />
        </button>
      </div>
    </header>
  );
}

function BrandLink(props: { className: string; href: string | null; children: JSX.Element }) {
  return (
    <Show when={props.href} fallback={<span class={props.className}>{props.children}</span>}>
      {(href) => (
        <a class={props.className} href={href()} target="_blank" rel="noreferrer">
          {props.children}
        </a>
      )}
    </Show>
  );
}

function clipEnd(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}...`;
}
