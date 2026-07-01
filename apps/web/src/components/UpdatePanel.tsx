/**
 * UI component: Update Panel. Exports `UpdatePanel`.
 *
 * The unified "App + Backend" update surface opened by clicking the corner
 * {@link VersionBadge}. It shows up to two rows:
 *
 *  - **App shell** — the running build ({@link APP_VERSION}) vs the latest
 *    available build. On the web that's the deployed `version.json` marker; on
 *    the desktop it's the signed Tauri-updater release. The Update action is
 *    gated behind an explicit confirm step (web: hard reload onto the new
 *    bundle; desktop: download + install the signed binary and relaunch).
 *
 *  - **Backend** — the connected backend's advertised version (from
 *    /v1/capabilities) vs the latest release of the brand's
 *    `backendRepository`. This row is shown ONLY when the active brand sets a
 *    `backendRepository` (today: the CLIO profile → iowarp/clio-agent); the
 *    neutral GACT profile omits it entirely. The web cannot install host
 *    software, so its backend action is an informational link to the repo;
 *    the desktop triggers the supervisor's install/repair runner.
 *
 * Every Update action requires a two-step confirm: the row first shows
 * "Update", and only after the user clicks it does the real action fire (the
 * second "Confirm" click). This component owns no polling — it is handed the
 * current/latest versions and the action callbacks, which keeps it pure and
 * fully unit-testable.
 */
import { createSignal, Show } from 'solid-js';
import { Icon } from './Icon.js';
import { compareVersions, type BackendRepository, type UpdateState } from '../backend_update.js';
import './update-panel.css';

/** One row's data + behaviour. `onUpdate` is omitted for info-only rows. */
export interface UpdateRow {
  /** Row heading, e.g. "App shell" or "CLIO backend". */
  label: string;
  /** Currently-installed version, or null when unknown. */
  current: string | null;
  /** Latest available version, or null when it could not be determined. */
  latest: string | null;
  /**
   * Apply the update. Fired only AFTER the in-row confirm step. Omit for
   * rows that cannot self-update in this shell (web backend → link only).
   */
  onUpdate?: () => void | Promise<void>;
  /**
   * Informational link shown when there is no in-shell update action (web
   * backend row). Rendered instead of the Update button.
   */
  link?: { label: string; url: string; title?: string };
}

export interface UpdatePanelProps {
  open: boolean;
  onClose: () => void;
  /** App-shell row (always present). */
  app: UpdateRow;
  /**
   * Backend row. Omit entirely when the active brand has no
   * `backendRepository` — the row must NOT render in that case.
   */
  backend?: UpdateRow;
}

/**
 * Build the backend {@link UpdateRow} for a given shell, or `undefined` when
 * the brand has no `backendRepository` (so the panel hides the row). Keeps the
 * "hidden without a repo" rule in one tested place.
 */
export function backendRow(args: {
  repository: BackendRepository | null;
  installedVersion: string | null;
  latestVersion: string | null;
  /** Desktop only: trigger the supervisor install/repair runner. */
  onUpdate?: () => void | Promise<void>;
}): UpdateRow | undefined {
  if (!args.repository) return undefined;
  const row: UpdateRow = {
    label: args.repository.detail || args.repository.label,
    current: args.installedVersion,
    latest: args.latestVersion,
  };
  if (args.onUpdate) {
    row.onUpdate = args.onUpdate;
  } else {
    // Web cannot install host software — surface the repo instead.
    row.link = {
      label: 'Releases',
      url: args.repository.url,
      title: args.repository.label,
    };
  }
  return row;
}

function stateLabel(state: UpdateState): string {
  switch (state) {
    case 'current':
      return 'Up to date';
    case 'available':
      return 'Update available';
    case 'unknown':
      return 'Unknown';
  }
}

/** A single update row with its own two-step confirm gate. */
function Row(props: { row: UpdateRow; testid: string }) {
  const [confirming, setConfirming] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const state = () => compareVersions(props.row.current, props.row.latest);

  async function fire() {
    const action = props.row.onUpdate;
    if (!action) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div class="update-panel__row" data-testid={props.testid} data-state={state()}>
      <div class="update-panel__row-main">
        <span class="update-panel__row-label">{props.row.label}</span>
        <span class="update-panel__row-versions">
          <span class="update-panel__ver-label">installed</span>
          <span class="update-panel__ver" data-testid={`${props.testid}-current`}>
            {props.row.current ?? '—'}
          </span>
          <Show when={state() === 'available'}>
            <Icon name="arrow-up-right" size={12} class="update-panel__ver-arrow" />
            <span class="update-panel__ver-label">latest release</span>
            <span class="update-panel__ver update-panel__ver--latest">
              {props.row.latest ?? '—'}
            </span>
          </Show>
        </span>
      </div>
      <div class="update-panel__row-action">
        <span class={`update-panel__status update-panel__status--${state()}`}>
          {stateLabel(state())}
        </span>
        <Show when={props.row.link}>
          {(link) => (
            <a
              class="update-panel__link"
              href={link().url}
              title={link().title ?? link().url}
              target="_blank"
              rel="noreferrer"
              data-testid={`${props.testid}-link`}
            >
              {link().label}
              <Icon name="arrow-up-right" size={12} />
            </a>
          )}
        </Show>
        <Show when={props.row.onUpdate && state() === 'available'}>
          <Show
            when={confirming()}
            fallback={
              <button
                type="button"
                class="update-panel__btn"
                data-testid={`${props.testid}-update`}
                onClick={() => setConfirming(true)}
              >
                Update
              </button>
            }
          >
            <button
              type="button"
              class="update-panel__btn update-panel__btn--confirm"
              data-testid={`${props.testid}-confirm`}
              disabled={busy()}
              onClick={() => void fire()}
            >
              {busy() ? 'Updating…' : 'Confirm'}
            </button>
            <button
              type="button"
              class="update-panel__btn update-panel__btn--ghost"
              data-testid={`${props.testid}-cancel`}
              disabled={busy()}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          </Show>
        </Show>
      </div>
    </div>
  );
}

/**
 * The update popover. Rendered as a fixed-position card anchored above the
 * corner badge, with a click-catching backdrop. Pure: all version data and
 * actions are supplied by the caller (see {@link VersionBadge}).
 */
export function UpdatePanel(props: UpdatePanelProps) {
  return (
    <Show when={props.open}>
      <div class="update-panel__backdrop" onClick={props.onClose} data-testid="update-panel-backdrop" />
      <div
        class="update-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Updates"
        data-testid="update-panel"
      >
        <header class="update-panel__head">
          <span class="update-panel__title">Updates (release pages)</span>
          <button
            type="button"
            class="update-panel__close"
            aria-label="Close updates"
            data-testid="update-panel-close"
            onClick={props.onClose}
          >
            <Icon name="close" size={14} />
          </button>
        </header>
        <div class="update-panel__rows">
          <Row row={props.app} testid="update-row-app" />
          <Show when={props.backend}>
            {(row) => <Row row={row()} testid="update-row-backend" />}
          </Show>
        </div>
      </div>
    </Show>
  );
}
