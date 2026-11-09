import type { QueryObserverResult } from '@tanstack/react-query';

/**
 * Re-render on these result fields only. React Query re-renders an observer whose
 * result nobody has read yet on every change, including the idle stale flip, so a
 * query read only conditionally (a hidden panel, an error fallback) needs its fields
 * declared up front.
 */
export const QUERY_RESULT_FIELDS: Array<keyof QueryObserverResult> = ['data', 'error', 'isPending'];
