import { deferredModule } from '@/lib/deferred-chunk';

/**
 * The cascader (and Base UI under it) stays out of the initial bundle: it loads
 * on the picker's first open, or earlier while the app is idle.
 */
export const modelPickerCatalog = deferredModule(() =>
  import('./model-picker-catalog').then((module) => module.ModelPickerCatalog),
);
