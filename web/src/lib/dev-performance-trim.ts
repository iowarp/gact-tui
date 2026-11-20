/**
 * React's development build logs every changed-props render to the Performance
 * timeline as a `performance.measure` entry carrying a copy of the props diff.
 * The browser keeps every entry until it is cleared, so a streamed turn, which
 * re-renders the transcript at frame cadence, grows the page by about 1 GB a
 * minute. DevTools records the entries as they are made, so clearing the
 * buffer keeps the React Performance tracks working. Production builds log
 * nothing and do not install this.
 */
const TRIM_INTERVAL_MS = 1000;

export function installDevPerformanceTrim(): () => void {
  if (typeof performance === 'undefined' || typeof performance.clearMeasures !== 'function') return () => {};
  const timer = window.setInterval(() => performance.clearMeasures(), TRIM_INTERVAL_MS);
  return () => window.clearInterval(timer);
}
