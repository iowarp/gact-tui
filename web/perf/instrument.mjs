// In-page instrumentation shared by the perf journeys and the screenshot
// pipeline. Installed with `context.addInitScript(installPerfObservers)` so it
// observes from the first byte of every document.
//
// Latency model, per interaction:
//   readyMs  input event timestamp -> first animation frame in which the
//            expected UI (a new menu/dialog/listbox, a route marker, a typed
//            character) is present and visible. This is what the user waits for,
//            including lazy chunks and data the surface needs before it shows.
//   eventMs  Event Timing duration of the interaction (input delay + handlers +
//            next paint; Chrome reports entries >= 16 ms, so null means < 16 ms).
//   settleMs input -> DOM quiet for 250 ms (follow-up async work; capped).
// Long tasks, long animation frames and layout shifts are attributed to the
// window [input, settle].

/** Runs in the page before any app script. Must be self-contained. */
export function installPerfObservers() {
  if (window.__perf) return;
  const state = {
    lastInput: null,
    longTasks: [],
    frames: [],
    shifts: [],
    events: [],
    lastMutation: performance.now(),
    paints: {},
  };
  const record = (list, entry, map) => {
    list.push(map(entry));
    if (list.length > 5000) list.splice(0, list.length - 5000);
  };
  const observe = (type, list, map, extra = {}) => {
    try {
      new PerformanceObserver((entries) => {
        for (const entry of entries.getEntries()) record(list, entry, map);
      }).observe({ type, buffered: true, ...extra });
    } catch {
      // Unsupported entry type in this engine.
    }
  };
  observe('longtask', state.longTasks, (entry) => ({
    start: entry.startTime,
    duration: entry.duration,
  }));
  observe('long-animation-frame', state.frames, (entry) => ({
    start: entry.startTime,
    duration: entry.duration,
    blocking: entry.blockingDuration,
    scripts: (entry.scripts ?? [])
      .filter((script) => script.duration >= 10)
      .slice(0, 4)
      .map((script) => ({
        duration: Math.round(script.duration),
        invoker: script.invoker,
        source: `${script.sourceURL ?? ''}`.split('/').pop(),
        fn: script.sourceFunctionName,
        char: script.sourceCharPosition,
      })),
  }));
  observe('layout-shift', state.shifts, (entry) => ({
    start: entry.startTime,
    value: entry.value,
    input: entry.hadRecentInput,
  }));
  observe(
    'event',
    state.events,
    (entry) => ({
      start: entry.startTime,
      duration: entry.duration,
      name: entry.name,
      interactionId: entry.interactionId,
      processing: entry.processingEnd - entry.processingStart,
      delay: entry.processingStart - entry.startTime,
    }),
    { durationThreshold: 16 },
  );
  observe('paint', [], (entry) => {
    state.paints[entry.name] = entry.startTime;
    return {};
  });
  observe('largest-contentful-paint', [], (entry) => {
    state.paints.lcp = entry.startTime;
    return {};
  });
  state.resources = [];
  try {
    performance.setResourceTimingBufferSize(100_000);
  } catch {
    // Older engines.
  }
  observe('resource', state.resources, (entry) => ({ name: entry.name, end: entry.responseEnd }));
  for (const type of ['pointerdown', 'keydown', 'mousedown', 'wheel']) {
    window.addEventListener(
      type,
      (event) => {
        if (state.armed && state.lastInput === null) state.lastInput = event.timeStamp;
      },
      { capture: true, passive: true },
    );
  }
  const startMutationObserver = () => {
    new MutationObserver(() => {
      state.lastMutation = performance.now();
    }).observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
  };
  if (document.documentElement) startMutationObserver();
  else document.addEventListener('readystatechange', startMutationObserver, { once: true });

  const overlaySelector =
    '[role="menu"],[role="dialog"],[role="alertdialog"],[role="listbox"],[data-radix-popper-content-wrapper]';
  const visible = (element) => {
    if (!element.isConnected || element.getClientRects().length === 0) return false;
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0)
      return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const label = (candidate) => {
    const element = candidate.matches('[data-radix-popper-content-wrapper]')
      ? (candidate.querySelector('[role]') ?? candidate)
      : candidate;
    const labelledBy = element.getAttribute('aria-labelledby');
    const name =
      element.getAttribute('aria-label') ??
      (labelledBy ? document.getElementById(labelledBy)?.textContent : null) ??
      (element.querySelector('h1,h2,h3,[role="heading"]')?.textContent || '') ??
      '';
    return `${element.getAttribute('role') ?? element.tagName.toLowerCase()} "${name.trim().slice(0, 60)}"`;
  };

  /**
   * Arm one measurement. `spec`:
   *   {overlay:true}            a menu/dialog/listbox not present at arm time
   *                             (or the pressed control, marked data-perf-target,
   *                             reports aria-expanded="true")
   *   {css, text?}              an element matching css (and text) is visible
   *   {css, gone:true}          no visible element matches css
   *   {css, minLength}          the matched input's value/text reaches a length
   *   {css, minCount}           at least n elements match css
   *   {css, changed:true}       the first visible match's text differs from arm time
   *   {css, appearsThenGone}    a match was seen and has since disappeared (spinners)
   *   {resource}                a fetch whose URL matches the regex source completed
   *   {all:[spec, ...]}         every sub-spec holds
   */
  const arm = (spec) => {
    state.armed = true;
    state.armTime = performance.now();
    state.lastInput = null;
    // Without an input event (a history push), the measurement starts at arm.
    state.armStart = spec.noInput ? state.armTime : null;
    state.spec = spec;
    state.result = null;
    state.before = new WeakSet(document.querySelectorAll(overlaySelector));
    const initial = new Map();
    const seen = new Set();
    const capture = (sub) => {
      if (sub.all) sub.all.forEach(capture);
      else if (sub.changed)
        initial.set(
          sub,
          [...document.querySelectorAll(sub.css)].find(visible)?.textContent ?? null,
        );
    };
    capture(spec);
    const check = (sub) => {
      if (sub.all) {
        const parts = sub.all.map(check);
        return parts.every(Boolean) ? parts.join(' + ') : null;
      }
      if (sub.overlay) {
        for (const element of document.querySelectorAll(overlaySelector)) {
          if (element.querySelector('[role="tooltip"]')) continue;
          if (!state.before.has(element) && visible(element)) return label(element);
        }
        const target = document.querySelector('[data-perf-target]');
        if (target?.getAttribute('aria-expanded') === 'true') return 'expanded control';
        return null;
      }
      if (sub.resource) {
        const pattern = new RegExp(sub.resource, 'u');
        const hit = state.resources.find(
          (entry) => entry.end >= state.armTime && pattern.test(entry.name),
        );
        return hit ? `fetched ${hit.name.split('/').slice(-2).join('/').slice(0, 80)}` : null;
      }
      const elements = [...document.querySelectorAll(sub.css)].filter(visible);
      if (sub.gone) return elements.length === 0 ? 'gone' : null;
      if (sub.appearsThenGone) {
        if (elements.length) seen.add(sub);
        return seen.has(sub) && elements.length === 0 ? 'appeared then gone' : null;
      }
      if (sub.minCount !== undefined) {
        const count = document.querySelectorAll(sub.css).length;
        return count >= sub.minCount ? `${count} × ${sub.css}` : null;
      }
      if (sub.changed) {
        const text = elements[0]?.textContent ?? null;
        return text !== null && text !== initial.get(sub)
          ? `${sub.css} "${text.trim().slice(0, 60)}"`
          : null;
      }
      for (const element of elements) {
        if (sub.text) {
          const text = `${element.getAttribute('aria-label') ?? ''} ${element.textContent ?? ''}`;
          if (!text.includes(sub.text)) continue;
        }
        if (sub.minLength !== undefined) {
          const value = 'value' in element ? element.value : element.textContent;
          if ((value ?? '').length < sub.minLength) continue;
        }
        return sub.text ? `${label(element)} ~ "${sub.text}"` : label(element);
      }
      return null;
    };
    const tick = (frameTime) => {
      if (!state.armed) return;
      const found = state.lastInput !== null || spec.noInput ? check(spec) : null;
      if (found) {
        state.result = { ready: performance.now(), frameTime, matched: found };
        state.armed = false;
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const collect = async (spec = {}) => {
    const deadline = performance.now() + (spec.timeoutMs ?? 10_000);
    while (!state.result && performance.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
    state.armed = false;
    const input = state.lastInput ?? state.armStart ?? null;
    const result = state.result;
    if (!result || input === null) {
      return {
        ok: false,
        reason: result ? 'no input event observed' : 'expected UI never appeared',
        input,
      };
    }
    // Follow-up work: wait for 250 ms of DOM quiet (capped at 3 s).
    const settleDeadline = performance.now() + 3000;
    while (performance.now() - state.lastMutation < 250 && performance.now() < settleDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const settle = Math.max(result.ready, Math.min(state.lastMutation, settleDeadline));
    const inWindow = (entry) => entry.start >= input - 1 && entry.start <= settle + 50;
    const longTasks = state.longTasks.filter(inWindow);
    const frames = state.frames.filter(inWindow);
    const events = state.events.filter(
      (entry) => entry.start >= input - 1 && entry.start <= result.ready + 1,
    );
    const shifts = state.shifts.filter(inWindow);
    const worstFrame = frames.reduce(
      (worst, frame) => (frame.duration > (worst?.duration ?? 0) ? frame : worst),
      null,
    );
    return {
      ok: true,
      matched: result.matched,
      readyMs: Math.max(0, result.ready - input),
      eventMs: events.length ? Math.max(...events.map((entry) => entry.duration)) : null,
      settleMs: Math.max(0, settle - input),
      longTaskCount: longTasks.length,
      longTaskMs: longTasks.reduce((sum, task) => sum + task.duration, 0),
      maxLongTaskMs: longTasks.reduce((max, task) => Math.max(max, task.duration), 0),
      loafCount: frames.length,
      loafBlockingMs: frames.reduce((sum, frame) => sum + (frame.blocking ?? 0), 0),
      worstFrame,
      cls: shifts.filter((shift) => !shift.input).reduce((sum, shift) => sum + shift.value, 0),
      clsWithInput: shifts.reduce((sum, shift) => sum + shift.value, 0),
    };
  };

  /** Arm without an input event (scroll/route/load measurements start now). */
  const armNow = (spec) => {
    arm({ ...spec, noInput: true });
    state.lastInput = performance.now();
  };

  const totals = () => ({
    longTaskCount: state.longTasks.length,
    longTaskMs: state.longTasks.reduce((sum, task) => sum + task.duration, 0),
    cls: state.shifts.filter((shift) => !shift.input).reduce((sum, shift) => sum + shift.value, 0),
    paints: state.paints,
    domElements: document.getElementsByTagName('*').length,
  });

  window.__perf = { arm, armNow, collect, totals, state };

  // First frame in which each configured selector is visible, from navigation
  // start (cold-load marks). Configure with window.__PERF_MARKS__ = {name: css}
  // from a later init script; it is read every frame.
  state.marks = {};
  const watchMarks = () => {
    const marks = window.__PERF_MARKS__ ?? {};
    for (const [name, css] of Object.entries(marks)) {
      if (state.marks[name] !== undefined) continue;
      const element = document.querySelector(css);
      if (element && visible(element)) state.marks[name] = Math.round(performance.now());
    }
    const pending =
      !window.__PERF_MARKS__ || Object.keys(marks).some((name) => state.marks[name] === undefined);
    if (pending && performance.now() < 60_000) requestAnimationFrame(watchMarks);
  };
  requestAnimationFrame(watchMarks);
}

/** CDP metrics for the page: heap, nodes, listeners, layout counts. */
export async function cdpMetrics(cdp, { gc = false } = {}) {
  if (gc) await cdp.send('HeapProfiler.collectGarbage');
  const { metrics } = await cdp.send('Performance.getMetrics');
  const byName = Object.fromEntries(metrics.map((metric) => [metric.name, metric.value]));
  return {
    jsHeapUsedMB: round(byName.JSHeapUsedSize / 2 ** 20),
    jsHeapTotalMB: round(byName.JSHeapTotalSize / 2 ** 20),
    nodes: byName.Nodes,
    documents: byName.Documents,
    listeners: byName.JSEventListeners,
    layoutCount: byName.LayoutCount,
    recalcStyleCount: byName.RecalcStyleCount,
    layoutMs: round((byName.LayoutDuration ?? 0) * 1000),
    scriptMs: round((byName.ScriptDuration ?? 0) * 1000),
    taskMs: round((byName.TaskDuration ?? 0) * 1000),
  };
}

export const round = (value, digits = 1) =>
  value === null || value === undefined || Number.isNaN(value)
    ? value
    : Number(value.toFixed(digits));

export function percentile(values, p) {
  const sorted = values.filter((value) => typeof value === 'number').sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}
