import { useEffect, useRef } from 'react';

const REPORT_PROBLEM_EVENT = 'clio:report-problem';

/** The settings route of Report a problem, about one conversation when it names one. */
export function reportProblemRoute(conversationId?: string): string {
  return conversationId
    ? `/settings/report-problem?${new URLSearchParams({ conversation: conversationId })}`
    : '/settings/report-problem';
}

/**
 * Asks the app to open Settings › Report a problem, about `conversationId` when
 * given. A transcript row calls this rather than navigating itself, so the many
 * rows of a long conversation never re-render on a route change.
 */
export function requestReportProblem(conversationId?: string): void {
  window.dispatchEvent(
    new CustomEvent<string | undefined>(REPORT_PROBLEM_EVENT, { detail: conversationId }),
  );
}

/** Handles {@link requestReportProblem}; the app shell opens Settings over the page behind. */
export function useReportProblemRequests(open: (conversationId?: string) => void): void {
  const handler = useRef(open);
  useEffect(() => {
    handler.current = open;
  });
  useEffect(() => {
    const listener = (event: Event) =>
      handler.current((event as CustomEvent<string | undefined>).detail || undefined);
    window.addEventListener(REPORT_PROBLEM_EVENT, listener);
    return () => window.removeEventListener(REPORT_PROBLEM_EVENT, listener);
  }, []);
}
