import '@h5web/app/styles.css';
import './viewer.css';

import { App, H5GroveProvider, useEntity, type ProvidedEntity } from '@h5web/app';
import {
  Component,
  StrictMode,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createRoot } from 'react-dom/client';
import { HostBridge, createExportURL, observeSelection } from './bridge';
import { hostOriginFor } from './host-origin';
import { dtypeName, entityKind, observeView, shapeOf } from './modes';
import { applyTheme } from './theme';
import { HDF5_VIEWER_PROTOCOL, VIEWER_SOURCE, type HostMessage } from './protocol';

type Init = Extract<HostMessage, { type: 'init' }>;
type Show = Extract<HostMessage, { type: 'show' }>;

/** The only page whose messages this viewer accepts, and the one it answers. */
const hostOrigin = hostOriginFor(window.location);

function Viewer() {
  const bridge = useMemo(() => new HostBridge(window.parent, hostOrigin), []);
  const [init, setInit] = useState<Init>();
  const [locator, setLocator] = useState('/');
  const rootRef = useRef<HTMLDivElement>(null);
  const showRef = useRef<((message: Show) => void) | undefined>(undefined);

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== window.parent || event.origin !== hostOrigin) return;
      const next = bridge.receive(event.data);
      if (next?.type === 'init') {
        setInit(next);
        setLocator(next.locator ?? '/');
      } else if (next?.type === 'show') showRef.current?.(next);
    };
    window.addEventListener('message', onMessage);
    bridge.post({ source: VIEWER_SOURCE, type: 'ready', protocol: HDF5_VIEWER_PROTOCOL });
    return () => window.removeEventListener('message', onMessage);
  }, [bridge]);

  useEffect(() => {
    if (init?.theme) applyTheme(document, init.theme);
  }, [init?.theme]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !init) return undefined;
    return observeSelection(root, (selected) => {
      setLocator(selected);
      bridge.post({ source: VIEWER_SOURCE, type: 'select', locator: selected });
    });
  }, [bridge, init]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !init) return undefined;
    const view = observeView(root, (state) =>
      bridge.post({ source: VIEWER_SOURCE, type: 'modes', ...state }),
    );
    showRef.current = view.show;
    return () => {
      showRef.current = undefined;
      view.dispose();
    };
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
        <ReportBoundary key={locator}>
          <Suspense fallback={null}>
            <EntityReport
              locator={locator}
              onEntity={(entity) =>
                bridge.post({
                  source: VIEWER_SOURCE,
                  type: 'entity',
                  locator,
                  kind: entityKind(entity),
                  shape: shapeOf(entity),
                  dtype: 'type' in entity && entity.type ? dtypeName(entity.type) : undefined,
                })
              }
            />
          </Suspense>
        </ReportBoundary>
        <App
          initialPath={init.locator ?? '/'}
          sidebarOpen
          // With a host theme, applyTheme() owns dark mode; without one,
          // h5web's own OS-following dark mode stays on.
          disableDarkMode={init.theme !== undefined}
        />
      </H5GroveProvider>
    </div>
  );
}

/**
 * Tells the host the shape and type of the open object, for its frame. h5web
 * has already read this entity to show it, so this is answered from its cache.
 */
function EntityReport({
  locator,
  onEntity,
}: {
  locator: string;
  onEntity: (entity: ProvidedEntity) => void;
}) {
  const entity = useEntity(locator);
  const report = useRef(onEntity);
  useEffect(() => {
    report.current = onEntity;
  });
  useEffect(() => report.current(entity), [entity]);
  return null;
}

/** A failed read is h5web's to show; the report just stays quiet. */
class ReportBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <Viewer />
    </StrictMode>,
  );
}
