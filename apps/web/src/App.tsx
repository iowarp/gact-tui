import { useCallback, useEffect, useRef, useState } from 'react';
import { ConnectionPool } from './connections/ConnectionPool';
import { APP_VERSION } from './build-info';
import {
  DEFAULT_UPDATE_POLL_MS,
  fetchDeployedVersion,
  isNewerBuild,
} from './wire/updateCheck';
import type { RailConnection } from './shell/Rail';
import { brand } from '@brand';
import {
  connectBackend,
  type ConnectFailure,
  type ConnectedBackend,
} from './backend/connection';
import { ConnectScreen } from './connect/ConnectScreen';
import { KitGallery } from './kit/KitGallery';
import { ShellPreview } from './shell/ShellPreview';
import { SessionView } from './session/SessionView';
import {
  forgetBackend,
  lastUsed,
  loadRegistry,
  rememberBackend,
  saveRegistry,
  setLastUsed,
} from './connect/registry';
import type { BackendEntry } from '@clio/core';
import { applyAppearance, loadAppearance } from './theme/theme';

const LAST_URL_KEY = 'clio.backend.last-url.v3';

/** Default the field to the last backend used, else the brand's attach port. */
function initialUrl(): string {
  try {
    const remembered = localStorage.getItem(LAST_URL_KEY);
    if (remembered) return remembered;
  } catch {
    // Storage unavailable — fall through to the brand default.
  }
  return `http://127.0.0.1:${brand.backend.attachPort}`;
}

export function App() {
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ConnectFailure | null>(null);
  const [backend, setBackend] = useState<ConnectedBackend | null>(null);
  const [saved, setSaved] = useState<BackendEntry[]>(() => loadRegistry().backends);

  // THE connection owner (gact-tui#338). Every connection holds its own client
  // and its own failure state; nothing here is process-global, which is what
  // the pool's leak tests protect. A refused backend is KEPT with its reason
  // rather than dropped, so the rail can show why it will not serve.
  const pool = useRef(new ConnectionPool()).current;
  const [connections, setConnections] = useState<RailConnection[]>([]);
  const [activeConnectionId, setActiveConnectionId] = useState<string>('');

  const syncPool = useCallback(() => {
    setConnections(
      pool.list().map((c) => ({ id: c.id, label: c.label, url: c.url, status: c.status })),
    );
  }, [pool]);

  useEffect(() => {
    applyAppearance(loadAppearance(), document.documentElement);
  }, []);

  // Poll the deployed build marker, and re-check on focus: someone returning
  // to a long-open tab is exactly who is running a stale bundle. Ported from
  // the legacy tree — this never needed a backend endpoint.
  const [newBuildAvailable, setNewBuildAvailable] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const deployed = await fetchDeployedVersion();
      if (!cancelled && isNewerBuild(APP_VERSION, deployed)) setNewBuildAvailable(true);
    };
    void check();
    const timer = setInterval(() => void check(), DEFAULT_UPDATE_POLL_MS);
    window.addEventListener('focus', () => void check());
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const onConnect = useCallback(async (url: string) => {
    setPending(true);
    setFailure(null);
    const result = await connectBackend(url);
    // Record the attempt in the pool whatever the outcome: a refusal the user
    // can see beats one that vanishes.
    await pool.connect({ id: url, label: url, url });
    syncPool();
    setPending(false);
    if (result.kind === 'failed') {
      setFailure(result);
      return;
    }
    try {
      localStorage.setItem(LAST_URL_KEY, result.url);
      // Record it in the backend registry. The rail footer counts CONNECTED
      // CLIO DEPLOYMENTS from here — a UI-owned set, not anything the backend
      // serves — so a connection that is never recorded makes that count lie.
      const next = setLastUsed(
        rememberBackend(loadRegistry(), { url: result.url, label: result.url }),
        result.url,
      );
      saveRegistry(next);
      setSaved(next.backends);
    } catch {
      // Storage unavailable; the connection itself is unaffected.
    }
    setActiveConnectionId(url);
    setBackend(result);
  }, [pool, syncPool]);

  const onForget = useCallback((url: string) => {
    const next = forgetBackend(loadRegistry(), url);
    saveRegistry(next);
    setSaved(next.backends);
  }, []);

  // Autoconnect to the backend last used. Re-typing the same address on every
  // boot was a regression against the legacy app, which reconnected itself.
  // It runs ONCE and never retries: a failing autoconnect leaves the user on
  // the connect screen with the reason, rather than in a retry loop.
  const attempted = useRef(false);
  useEffect(() => {
    if (attempted.current || backend) return;
    attempted.current = true;
    const entry = lastUsed(loadRegistry());
    if (entry) void onConnect(entry.url);
  }, [backend, onConnect]);

  // Development surface for the component kit (gact-tui#331) — the fixtures
  // harness the visual gates screenshot. Not app chrome, not routable from it.
  // Checked after every hook so hook order stays identical across renders.
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.has('kit')) return <KitGallery />;
    if (params.has('shell')) return <ShellPreview />;
    if (params.has('obs')) return <ShellPreview surface="obs" />;
    if (params.has('settings')) return <ShellPreview surface="settings" />;
  }

  if (backend) {
    return (
      <SessionView
        client={backend.client}
        sessions={backend.sessions}
        onForgetSession={(sessionId) =>
          setBackend((cur) =>
            cur ? { ...cur, sessions: cur.sessions.filter((s) => s.id !== sessionId) } : cur,
          )
        }
        backendVersion={backend.capabilities?.backend?.version ?? ''}
        newBuildAvailable={newBuildAvailable}
        connections={connections}
        activeConnectionId={activeConnectionId}
        onSwitchConnection={(id) => {
          // Swapping deployments re-runs the same connect path, so the new
          // backend's sessions and capabilities are read fresh rather than
          // inherited from the one being left.
          const target = pool.get(id);
          if (target) void onConnect(target.url);
        }}
        onSessionCreated={(session) =>
          setBackend((cur) => (cur ? { ...cur, sessions: [session, ...cur.sessions] } : cur))
        }
      />
    );
  }

  return (
    <ConnectScreen
      initialUrl={initialUrl()}
      pending={pending}
      failure={failure}
      onEdit={() => setFailure(null)}
      onConnect={(url) => void onConnect(url)}
      saved={saved}
      onForget={onForget}
    />
  );
}
