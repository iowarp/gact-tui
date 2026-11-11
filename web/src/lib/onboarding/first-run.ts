/**
 * First-run detection for the onboarding tour.
 *
 * The tour opens by itself only on a fresh install, never after an update.
 * Two signals decide it, because a "seen" flag alone would also be missing for
 * everyone updating to the first build that ships the tour:
 *
 * 1. Prior app data on this device. `snapshotPriorInstall` reads storage at
 *    boot, before any of this launch's writes. Every earlier build leaves keys
 *    behind (What's New versions, appearance, recent connections, ...).
 * 2. Prior work on the connected service. A device with no app data can still
 *    point at a service that already has conversations (a reinstall, a second
 *    computer); that person is not new.
 *
 * Storage is the WebView's own profile, which updates keep on every platform.
 */

export const TOUR_STATE_KEY = 'clio.onboarding.v1';

export interface TourRecord {
  /** `new`: no prior data at the first launch that knew about the tour. */
  install: 'new' | 'existing';
  status?: 'completed' | 'skipped';
  at?: string;
}

let priorAppData: boolean | undefined;

/** Call once at boot, before anything writes storage. */
export function snapshotPriorInstall(storage: Storage | undefined = safeStorage()): void {
  if (!storage) return;
  try {
    let found = false;
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && key !== TOUR_STATE_KEY) {
        found = true;
        break;
      }
    }
    priorAppData = found;
  } catch {
    priorAppData = undefined;
  }
}

export function readTourRecord(
  storage: Storage | undefined = safeStorage(),
): TourRecord | undefined {
  try {
    const value = JSON.parse(storage?.getItem(TOUR_STATE_KEY) ?? 'null') as unknown;
    if (!value || typeof value !== 'object') return undefined;
    const record = value as Partial<TourRecord>;
    if (record.install !== 'new' && record.install !== 'existing') return undefined;
    return {
      install: record.install,
      ...(record.status === 'completed' || record.status === 'skipped'
        ? { status: record.status }
        : {}),
      ...(typeof record.at === 'string' ? { at: record.at } : {}),
    };
  } catch {
    return undefined;
  }
}

export function writeTourRecord(
  record: TourRecord,
  storage: Storage | undefined = safeStorage(),
): void {
  try {
    storage?.setItem(TOUR_STATE_KEY, JSON.stringify(record));
  } catch {
    // Without storage the tour can't remember it ran; it then never auto-starts.
  }
}

/**
 * What the first-run check does on this launch. `check-service` means the
 * device looks new and the connected service decides.
 */
export type FirstRunStep = 'never' | 'check-service';

export function firstRunStep(
  record: TourRecord | undefined,
  prior: boolean | undefined = priorAppData,
  storage: Storage | undefined = safeStorage(),
): FirstRunStep {
  if (record) return record.install === 'new' && !record.status ? 'check-service' : 'never';
  // Unknown (storage unreadable) is treated as an existing install.
  if (prior !== false) {
    if (prior === true) writeTourRecord({ install: 'existing' }, storage);
    return 'never';
  }
  // Remember the device was new now, so a first launch that ends before the
  // service is ready still counts as new on the next one.
  writeTourRecord({ install: 'new' }, storage);
  return 'check-service';
}

function safeStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
