import { lazy, type ComponentProps, type ComponentType } from 'react';

type ScientificMapViewComponent = typeof import('./scientific-map-view').ClioScientificMapView;

let loaded: ScientificMapViewComponent | undefined;
let loading: Promise<{ default: ScientificMapViewComponent }> | undefined;

/**
 * Loads the map renderer and MapLibre ahead of the first map. A map rendered
 * after this resolves mounts directly, without a loading fallback.
 */
export function preloadScientificMapView(): Promise<{ default: ScientificMapViewComponent }> {
  loading ??= Promise.all([import('./scientific-map-view'), import('maplibre-gl')]).then(
    ([module]) => {
      loaded = module.ClioScientificMapView;
      return { default: module.ClioScientificMapView };
    },
    (error: unknown) => {
      loading = undefined;
      throw error;
    },
  );
  return loading;
}

const LazyScientificMapView = lazy(preloadScientificMapView);

/** The renderer itself once preloaded, otherwise a lazy one that suspends while it loads. */
export function scientificMapView(): ComponentType<ComponentProps<ScientificMapViewComponent>> {
  return loaded ?? LazyScientificMapView;
}
