import { useCallback, useEffect, useState } from 'react';
import { brand } from '@brand';
import {
  connectBackend,
  type ConnectFailure,
  type ConnectedBackend,
} from './backend/connection';
import { ConnectScreen } from './connect/ConnectScreen';
import { KitGallery } from './kit/KitGallery';
import { SessionList } from './sessions/SessionList';
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
    } catch {
      // Storage unavailable; the connection itself is unaffected.
    }
    setBackend(result);
  }, []);

  // Development surface for the component kit (gact-tui#331) — the fixtures
  // harness the visual gates screenshot. Not app chrome, not routable from it.
  // Checked after every hook so hook order stays identical across renders.
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('kit')) {
    return <KitGallery />;
  }

  if (backend) {
    return <SessionList backend={backend} />;
  }

  return (
    <ConnectScreen
      initialUrl={initialUrl()}
      pending={pending}
      failure={failure}
      onConnect={(url) => void onConnect(url)}
    />
  );
}
