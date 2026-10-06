import '@h5web/app/styles.css';
import './viewer.css';

import { App, H5GroveProvider } from '@h5web/app';
import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HostBridge, createExportURL, observeSelection } from './bridge';
import { HDF5_VIEWER_PROTOCOL, VIEWER_SOURCE, type HostMessage } from './protocol';

type Init = Extract<HostMessage, { type: 'init' }>;

/** The host must be the page that framed this one, on the same origin. */
const hostOrigin = window.location.origin;

function Viewer() {
  const bridge = useMemo(() => new HostBridge(window.parent, hostOrigin), []);
  const [init, setInit] = useState<Init>();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== window.parent || event.origin !== hostOrigin) return;
      const next = bridge.receive(event.data);
      if (next) setInit(next);
    };
    window.addEventListener('message', onMessage);
    bridge.post({ source: VIEWER_SOURCE, type: 'ready', protocol: HDF5_VIEWER_PROTOCOL });
    return () => window.removeEventListener('message', onMessage);
  }, [bridge]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !init) return undefined;
    return observeSelection(root, (locator) =>
      bridge.post({ source: VIEWER_SOURCE, type: 'select', locator }),
    );
  }, [bridge, init]);

  if (!init) return null;
  if (init.protocol !== HDF5_VIEWER_PROTOCOL) {
    return <p className="viewer-error">Unsupported viewer protocol {init.protocol}.</p>;
  }
  return (
    <div className="viewer-root" ref={rootRef}>
      <H5GroveProvider
        url=""
        filepath={init.filepath}
        fetcher={bridge.fetcher}
        getExportURL={createExportURL(bridge.fetcher, init.filepath)}
        resetKeys={[init.revision]}
      >
        <App initialPath={init.locator ?? '/'} sidebarOpen />
      </H5GroveProvider>
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <Viewer />
    </StrictMode>,
  );
}
