import { For } from 'solid-js';
import type { SessionStatus } from '@clio/core';
import './sidebar.css';

export interface SidebarSession {
  id: string;
  title: string;
  status: SessionStatus;
  project: string;
  updatedAt: string;
  /** Epoch ms — last time this row was touched by SSE (drives row pulse). */
  bumpedAt?: number;
  /** Mirrors `metadata.pinned` from the server so the TUI and Desktop
   * agree on pin state. Reconciled into the local pinnedIds set on
   * session list refresh. */
  metaPinned?: boolean;
}

export interface SidebarProps {
  sessions: SidebarSession[];
  activeId: string;
  onSelect: (id: string) => void;
  /**
   * Wired in LiveDriven mode: clicking "+ new session" calls
   * `client.createSession()` and selects the new row. Fixture mode
   * leaves this undefined and the button is a no-op (kept visible so
   * the visual proof set still matches).
   */
  onNewSession?: () => void | Promise<void>;
}

function statusPip(s: SessionStatus): string {
  switch (s) {
    case 'running':
      return 'sidebar__pip--running';
    case 'waiting_permission':
      return 'sidebar__pip--waiting';
    case 'error':
      return 'sidebar__pip--error';
    case 'finished':
      return 'sidebar__pip--finished';
    default:
      return 'sidebar__pip--idle';
  }
}

export function Sidebar(props: SidebarProps) {
  const grouped = () => {
    const out = new Map<string, SidebarSession[]>();
    for (const s of props.sessions) {
      if (!out.has(s.project)) out.set(s.project, []);
      out.get(s.project)!.push(s);
    }
    return Array.from(out.entries());
  };

  return (
    <aside class="sidebar" data-testid="sidebar">
      <div class="sidebar__head">
        <span class="eyebrow">sessions</span>
        <span class="sidebar__counter">{props.sessions.length}</span>
      </div>

      {props.sessions.length === 0 ? (
        <div class="sidebar__empty" data-testid="sidebar-empty">
          <div class="eyebrow">no sessions yet</div>
          <p>
            Create one from the composer or via <code>POST /v1/sessions</code> on the backend.
          </p>
        </div>
      ) : (
        <div class="sidebar__list">
          <For each={grouped()}>
            {([project, sessions]) => (
              <div class="sidebar__group">
                <div class="sidebar__group-head">▼ {project}</div>
                <For each={sessions}>
                  {(s) => (
                    <button
                      type="button"
                      class={
                        'sidebar__row ' +
                        (s.id === props.activeId ? 'sidebar__row--active' : '')
                      }
                      onClick={() => props.onSelect(s.id)}
                      data-testid={`session-row-${s.id}`}
                    >
                      <span class={'sidebar__pip ' + statusPip(s.status)} />
                      <span class="sidebar__title">{s.title}</span>
                      <span class="sidebar__age">{s.updatedAt}</span>
                    </button>
                  )}
                </For>
              </div>
            )}
          </For>
        </div>
      )}

      <footer class="sidebar__foot">
        <button
          type="button"
          class="btn btn--secondary sidebar__newbtn"
          data-testid="sidebar-new-session"
          disabled={!props.onNewSession}
          onClick={() => void props.onNewSession?.()}
        >
          + new session
        </button>
      </footer>
    </aside>
  );
}
