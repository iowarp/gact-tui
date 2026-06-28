/**
 * UI component: Version Badge. Exports `VersionBadge`.
 */
import { createSignal } from 'solid-js';
import { brand } from '@brand';
import { APP_DIRTY, APP_VERSION } from '../build-info.js';
import { useBackendRegistry } from '../registry.js';
import { inTauri } from '../tauri.js';
import { createUpdateCheck } from '../updateCheck.js';
import { checkForDesktopUpdate, relaunchApp } from '../tauri_update.js';
import { updateClio } from '../tauri_install.js';
import {
  fetchLatestBackendVersion,
  type BackendRepository,
} from '../backend_update.js';
import { backendRow, UpdatePanel, type UpdateRow } from './UpdatePanel.js';
import './version-badge.css';

/**
 * A small fixed corner badge showing the build version (the repo-wide
 * `git describe` stamp), so you can confirm which build you're running — the
 * same signal the TUI shows on its splash. Renders in the warning colour with a
 * `-dirty` stamp when built from a working tree with uncommitted changes ("am I
 * running exactly what's committed?").
 *
 * Clicking the badge opens the {@link UpdatePanel}: a unified App + Backend
 * update surface (see that component). The badge is a real button — the manual
 * entry point that complements the automatic update checks wired in `App.tsx`.
 *
 * Props override the build globals / data sources for testing.
 */
export function VersionBadge(props: {
  version?: string;
  dirty?: boolean;
  /** Override the active brand's backend repository (tests). */
  backendRepository?: BackendRepository | null;
  /** Override the connected backend's advertised version (tests). */
  backendInstalledVersion?: string | null;
  /** Override the latest-backend-version fetcher (tests). */
  fetchLatestBackend?: (repo: BackendRepository) => Promise<string | null>;
  /** Override Tauri detection (tests). */
  inTauriOverride?: boolean;
  /** Override the app-shell row resolution (tests). */
  resolveAppRow?: () => Promise<UpdateRow>;
  /** Override the desktop backend-update trigger (tests). */
  triggerBackendUpdate?: () => Promise<void>;
}) {
  const version = () => props.version ?? APP_VERSION;
  const dirty = () => props.dirty ?? APP_DIRTY;
  const isTauri = () => props.inTauriOverride ?? inTauri();

  // The registry is only present under the app shell. Tests that render the
  // badge in isolation pass an explicit backendInstalledVersion instead.
  let reg: ReturnType<typeof useBackendRegistry> | null = null;
  try {
    reg = useBackendRegistry();
  } catch {
    reg = null;
  }

  const backendRepository = (): BackendRepository | null =>
    props.backendRepository !== undefined ? props.backendRepository : brand.backendRepository;

  const installedBackendVersion = (): string | null => {
    if (props.backendInstalledVersion !== undefined) return props.backendInstalledVersion;
    return reg?.current()?.capabilities?.backend?.version ?? null;
  };

  const [open, setOpen] = createSignal(false);
  const [appRow, setAppRow] = createSignal<UpdateRow>({
    label: 'App shell',
    current: version(),
    latest: null,
  });
  const [backend, setBackend] = createSignal<UpdateRow | undefined>(undefined);

  /** Resolve the app-shell row: web compares the deployed marker; desktop
   * asks the signed Tauri-updater release. */
  async function resolveAppRow(): Promise<UpdateRow> {
    if (props.resolveAppRow) return props.resolveAppRow();
    if (isTauri()) {
      const update = await checkForDesktopUpdate();
      return {
        label: 'App shell',
        current: version(),
        latest: update?.version ?? version(),
        onUpdate: update
          ? async () => {
              await update.downloadAndInstall();
              await relaunchApp();
            }
          : undefined,
      };
    }
    // Web: a one-shot marker check (no polling/listeners). A newer marker
    // means a fresh deploy is live — applying = a hard reload onto it.
    const handle = createUpdateCheck({ autoStart: false, currentVersion: version() });
    await handle.checkNow();
    handle.stop();
    const latest = handle.newVersion();
    return {
      label: 'App shell',
      current: version(),
      latest: latest ?? version(),
      onUpdate: handle.updateAvailable()
        ? () => {
            (window.location.reload as (forceReload?: boolean) => void)(true);
          }
        : undefined,
    };
  }

  /** Resolve the backend row (hidden when the brand has no repo). */
  async function resolveBackendRow(): Promise<UpdateRow | undefined> {
    const repo = backendRepository();
    if (!repo) return undefined;
    const fetcher =
      props.fetchLatestBackend ?? ((r: BackendRepository) => fetchLatestBackendVersion(r, fetch));
    const latest = await fetcher(repo);
    return backendRow({
      repository: repo,
      installedVersion: installedBackendVersion(),
      latestVersion: latest,
      // Desktop can install host software (reuse the supervisor install/repair
      // runner, pinned to the latest release tag). The web cannot — backendRow
      // falls back to a repo link.
      onUpdate: isTauri()
        ? props.triggerBackendUpdate ?? (() => updateClio(latest))
        : undefined,
    });
  }

  async function openPanel() {
    setOpen(true);
    // Resolve both rows in the background; the panel shows current versions
    // immediately and fills in "latest" as the checks resolve.
    setAppRow({ label: 'App shell', current: version(), latest: null });
    setBackend(
      backendRepository()
        ? {
            label: backendRepository()?.detail ?? 'Backend',
            current: installedBackendVersion(),
            latest: null,
          }
        : undefined,
    );
    const [app, back] = await Promise.all([resolveAppRow(), resolveBackendRow()]);
    setAppRow(app);
    setBackend(back);
  }

  return (
    <>
      <button
        type="button"
        class={'app-version-badge' + (dirty() ? ' app-version-badge--dirty' : '')}
        data-testid="app-version-badge"
        title={
          dirty()
            ? 'Built from a working tree with uncommitted changes — click for updates'
            : 'Build version — click for updates'
        }
        onClick={() => void openPanel()}
      >
        {version()}
      </button>
      <UpdatePanel
        open={open()}
        onClose={() => setOpen(false)}
        app={appRow()}
        backend={backend()}
      />
    </>
  );
}
