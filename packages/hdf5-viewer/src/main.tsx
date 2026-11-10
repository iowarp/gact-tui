import '@h5web/app/styles.css';
import './viewer.css';

import { App, H5GroveProvider, useDataContext, useEntity, type ProvidedEntity } from '@h5web/app';
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
import { dtypeName, entityKind, firstArrayDataset, observeView, shapeOf } from './modes';
import { applyPalette, applyTheme } from './theme';
import { observeSlicers } from './slicer';
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
  const openedRef = useRef<(() => void) | undefined>(undefined);

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
    if (init?.palette) applyPalette(document, init.palette, init.theme);
  }, [init?.theme, init?.palette]);

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
    openedRef.current = view.opened;
    const stopSlicers = observeSlicers(root);
    return () => {
      showRef.current = undefined;
      openedRef.current = undefined;
      stopSlicers();
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
              onEntity={(entity) => {
                bridge.post({
                  source: VIEWER_SOURCE,
                  type: 'entity',
                  locator,
                  kind: entityKind(entity),
                  shape: shapeOf(entity),
                  dtype: 'type' in entity && entity.type ? dtypeName(entity.type) : undefined,
                });
                if (entityKind(entity) === 'dataset') openedRef.current?.();
              }}
            />
          </Suspense>
        </ReportBoundary>
        <Suspense fallback={null}>
          <StartPath requested={init.locator}>
            {(start) => (
              <App
                initialPath={start}
                sidebarOpen
                // With a host theme, applyTheme() owns dark mode; without one,
                // h5web's own OS-following dark mode stays on.
                disableDarkMode={init.theme !== undefined}
              />
            )}
          </StartPath>
        </Suspense>
      </H5GroveProvider>
    </div>
  );
}

/**
 * The object to open: the one asked for, or else the file's first array
 * dataset, so a file opens on its data rather than on a root group h5web has
 * nothing to show for. A root with a NeXus `default` keeps h5web's own pick.
 */
function StartPath({
  requested,
  children,
}: {
  requested?: string;
  children: (path: string) => ReactNode;
}) {
  const { entitiesStore } = useDataContext();
  return children(requested ?? firstArrayDataset((path) => entitiesStore.get(path)));
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

/**
 * A heatmap fills its pane, as the workbench's Array view draws it, until the
 * reader turns h5web's Keep ratio on; that choice then persists as usual.
 */
function seedHeatmapDefaults(): void {
  try {
    if (localStorage.getItem('h5web:heatmap') === null) {
      localStorage.setItem(
        'h5web:heatmap',
        JSON.stringify({ state: { keepRatio: false }, version: 12 }),
      );
    }
  } catch {
    // Storage blocked: h5web keeps its own default.
  }
}

const container = document.getElementById('root');
if (container) {
  seedHeatmapDefaults();
  createRoot(container).render(
    <StrictMode>
      <Viewer />
    </StrictMode>,
  );
}
