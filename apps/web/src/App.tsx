import { useCallback, useEffect, useRef, useState } from 'react';
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

  useEffect(() => {
    applyAppearance(loadAppearance(), document.documentElement);
  }, []);

  const onConnect = useCallback(async (url: string) => {
    setPending(true);
    setFailure(null);
    const result = await connectBackend(url);
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
    setBackend(result);
  }, []);

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
