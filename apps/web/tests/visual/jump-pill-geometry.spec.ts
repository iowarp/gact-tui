/**
 * Regression lock for fix (d): the "Jump to latest" pill (testid
 * `scroll-to-bottom`, class `.chat__scroll-pill`) must NEVER overlap the
 * composer (`data-testid="composer"`, `.composer`) at ANY composer height.
 *
 * The pill is absolutely positioned inside `.chat__main-col` and derives its
 * vertical clearance from `--composer-h`, an inline custom property the
 * Composer's ResizeObserver publishes onto `.chat__main-col` (see
 * `Composer.tsx` `onMount` + `chat-transcript-scroll-pill.css`). A previous
 * magic-number `--composer-h` under-measured the composer and the pill dropped
 * onto the composer's top band the moment the `.composer__pickers` row WRAPPED
 * to two lines at a narrow main column (`composer-pickers.css`:
 * `flex-wrap: wrap` while the desktop layout is active, i.e. viewport wider
 * than the 760px breakpoint). This spec reproduces that wrap by shrinking
 * `--chat-content-w` (the same variable the narrow layout drives) and asserts:
 *
 *   1. base state: pill sits entirely above the composer (no overlap), and
 *      the published `--composer-h` tracks the real composer height;
 *   2. after the pickers row wraps and the composer grows, the ResizeObserver
 *      re-publishes `--composer-h` (it changes, not stays static) and the pill
 *      STILL clears the taller composer.
 *
 * Reuses the mock backend + SSE-driving harness pattern from
 * `transcript-autoscroll.spec.ts` so the spec needs no real backend.
 */
import { expect, test, type Page, type Route } from '@playwright/test';
import { capabilities, NOW } from './mock-backend-fixtures';

const MOCK_BACKEND = 'http://pillgeom.mock';
const SESSION_ID = 'mock-pill-geometry-session';
const ASSISTANT_ID = 'm-pillgeom-asst';
const PART_ID = 'p-pillgeom-answer';

// Small vertical tolerance (sub-pixel rounding between the ResizeObserver's
// Math.round(height) publish and Playwright's boundingBox measurement).
const TOL = 1;
// Offset tolerance: the pill's `bottom` calc uses the Math.round()ed
// --composer-h, the pill/column boxes are read at sub-pixel precision, and the
// absolute pill's containing-block padding adds a small constant — empirically
// ~4.5px of stable drift from the exact CSS value. 6px absorbs that while still
// catching any REAL clearance-math regression: a dropped --pill-clearance (16px)
// or --context-footer-h (40px) term, or a mis-scaled offset, all move it by far
// more than 6px. Under-measurement of the composer itself is caught separately
// by the ResizeObserver-contract assertion below.
const GAP_TOL = 6;

const initialText = Array.from(
  { length: 40 },
  (_, i) =>
    `Initial streamed paragraph ${i + 1}: this line creates enough transcript height for real scroll geometry.`,
).join('\n\n');

function eventFrame(type: string, payload: Record<string, unknown>) {
  return {
    type,
    occurred_at: NOW,
    payload,
  };
}

async function emitSse(page: Page, type: string, payload: Record<string, unknown>) {
  await page.evaluate(
    ({ type, frame }) => {
      window.dispatchEvent(
        new CustomEvent('__clio-test-sse', {
          detail: { type, data: JSON.stringify(frame) },
        }),
      );
    },
    { type, frame: eventFrame(type, payload) },
  );
}

async function bottomDistance(page: Page): Promise<number> {
  return page.getByTestId('transcript-pane').evaluate((el) => {
    return Math.max(0, el.scrollHeight - el.scrollTop - el.clientHeight);
  });
}

/** Measured height of the composer border box (what the ResizeObserver rounds). */
async function composerHeight(page: Page): Promise<number> {
  const box = await page.getByTestId('composer').boundingBox();
  return box ? box.height : -1;
}

/** The `--composer-h` value the Composer's ResizeObserver publishes onto
 *  `.chat__main-col` — parsed to a number of pixels. */
async function composerHVar(page: Page): Promise<number> {
  return page.evaluate(() => {
    const col = document.querySelector('.chat__main-col') as HTMLElement | null;
    if (!col) return -1;
    const raw = getComputedStyle(col).getPropertyValue('--composer-h').trim();
    return Number.parseFloat(raw);
  });
}

/** The exact vertical clearance the pill's own CSS asks for, read from the SAME
 *  custom properties its `bottom` calc uses: `--pill-clearance`, plus
 *  `--context-footer-h` when the per-expert context footer is docked above the
 *  composer (the `.chat__main-col:has(.chat__context-footer)` branch). Deriving
 *  the expected gap from the live vars — instead of a blanket ceiling — makes
 *  the geometry check fail for ANY clearance-math regression (a weakened
 *  formula, a dropped var, an under-measured composer by tens of px), not just a
 *  fully-frozen `--composer-h`. */
async function expectedPillGap(page: Page): Promise<number> {
  return page.evaluate(() => {
    const pill = document.querySelector('.chat__scroll-pill') as HTMLElement | null;
    if (!pill) return -1;
    const cs = getComputedStyle(pill);
    const px = (v: string) => Number.parseFloat(cs.getPropertyValue(v)) || 0;
    const docked = !!document.querySelector('.chat__main-col .chat__context-footer');
    return px('--pill-clearance') + (docked ? px('--context-footer-h') : 0);
  });
}

/** Assert the pill rect does NOT vertically intersect the composer rect: the
 *  pill (which is centered horizontally OVER the composer column, so the only
 *  thing separating them is vertical) must sit entirely above the composer's
 *  top edge. Also asserts the pill hugs the composer rather than floating at an
 *  arbitrary height, and that `--composer-h` tracks the real composer height —
 *  the ResizeObserver contract the magic-number regression broke. */
async function assertPillClearsComposer(page: Page, label: string) {
  const pill = await page.getByTestId('scroll-to-bottom').boundingBox();
  const composer = await page.getByTestId('composer').boundingBox();

  expect(pill, `${label}: pill must render with a box`).not.toBeNull();
  expect(composer, `${label}: composer must render with a box`).not.toBeNull();
  if (!pill || !composer) return;

  // Sanity: real, non-degenerate boxes (guards a trivially-true pass).
  expect(pill.width, `${label}: pill has width`).toBeGreaterThan(0);
  expect(pill.height, `${label}: pill has height`).toBeGreaterThan(0);
  expect(composer.height, `${label}: composer has a real height`).toBeGreaterThan(80);

  const pillBottom = pill.y + pill.height;

  // PRIMARY LOCK: no overlap — the pill's bottom edge is at or above the
  // composer's top edge. This is exactly what regressed when the pickers row
  // wrapped and `--composer-h` stayed at its static under-measured value.
  expect(
    pillBottom,
    `${label}: pill bottom (${pillBottom.toFixed(1)}) must not cross composer top (${composer.y.toFixed(1)})`,
  ).toBeLessThanOrEqual(composer.y + TOL);

  // The pill must hug the composer at EXACTLY the offset its CSS asks for — not
  // merely "somewhere above" (a loose ceiling would give a false PASS for a real
  // clearance-math regression that still leaves the pill above the composer top).
  // Verify the literal `bottom: calc(--composer-h + [--context-footer-h] +
  // --pill-clearance)`: the pill's bottom edge sits that far above the
  // .chat__main-col bottom. Measuring the offset from the COLUMN (not composer.y)
  // makes it independent of any padding between the composer and the column edge,
  // and since the pill's calc and composerHVar() read the SAME rounded
  // --composer-h, this stays tight (sub-pixel) rather than modelling the layout.
  const mainCol = await page.locator('.chat__main-col').boundingBox();
  expect(mainCol, `${label}: main column has a box`).not.toBeNull();
  if (!mainCol) return;
  const pillOffset = mainCol.y + mainCol.height - pillBottom;
  const composerHVarPx = await composerHVar(page);
  const clearance = await expectedPillGap(page);
  expect(clearance, `${label}: could resolve pill clearance vars`).toBeGreaterThan(0);
  expect(
    Math.abs(pillOffset - (composerHVarPx + clearance)),
    `${label}: pill sits ${pillOffset.toFixed(1)}px above the column bottom; CSS asks for --composer-h(${composerHVarPx}) + clearance(${clearance}) = ${composerHVarPx + clearance}px`,
  ).toBeLessThanOrEqual(GAP_TOL);

  // ResizeObserver contract: the published --composer-h matches the measured
  // composer height. This is the root the magic number violated.
  const published = await composerHVar(page);
  expect(
    Math.abs(published - composer.height),
    `${label}: --composer-h (${published}) must track composer height (${composer.height.toFixed(1)})`,
  ).toBeLessThanOrEqual(2);
}

async function installAutoscrollBackend(page: Page) {
  const session = {
    id: SESSION_ID,
    title: 'jump-pill geometry demo',
    status: 'running',
    workspace_id: 'ws-demo',
    created_at: NOW,
    updated_at: NOW,
    message_count: 2,
    mode: 'chat',
    edit_mode: 'diff',
    routing_mode: 'auto',
  };
  const messages = [
    {
      id: 'm-pillgeom-user',
      session_id: SESSION_ID,
      role: 'user',
      created_at: NOW,
      parts: [{ type: 'text', text: 'Stream a long answer so the jump pill appears.' }],
    },
    {
      id: ASSISTANT_ID,
      session_id: SESSION_ID,
      role: 'assistant',
      created_at: NOW,
      parts: [{ id: PART_ID, type: 'text', text: initialText }],
    },
  ];

  await page.addInitScript(() => {
    window.localStorage.setItem('clio.onboarding-done.v1', '1');

    // Mock the `/events` SSE stream at window.fetch: return a text/event-stream
    // body that STAYS OPEN, and let `__clio-test-sse` enqueue frames on demand
    // so the test drives streaming deltas at will. Other requests fall through
    // to the route() handler below.
    const nativeFetch = window.fetch.bind(window);
    const encoder = new TextEncoder();
    const controllers = new Set<ReadableStreamDefaultController<Uint8Array>>();

    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith('http://pillgeom.mock') && url.includes('/events')) {
        let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            streamController = controller;
            controllers.add(controller);
          },
          cancel() {
            if (streamController) controllers.delete(streamController);
          },
        });
        init?.signal?.addEventListener('abort', () => {
          if (!streamController) return;
          controllers.delete(streamController);
          try {
            streamController.close();
          } catch {
            /* already closed */
          }
        });
        return Promise.resolve(
          new Response(stream, {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          }),
        );
      }
      return nativeFetch(input, init);
    }) as typeof window.fetch;

    window.addEventListener('__clio-test-sse', (raw) => {
      const detail = (raw as CustomEvent<{ type: string; data: string }>).detail;
      const block = encoder.encode(`data: ${detail.data}\n\n`);
      for (const controller of controllers) {
        controller.enqueue(block);
      }
    });
  });

  await page.route(`${MOCK_BACKEND}/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    if (method === 'GET' && path === '/v1/capabilities') return json(route, capabilities());
    if (method === 'GET' && path === '/v1/sessions') return json(route, { sessions: [session] });
    if (method === 'GET' && path === `/v1/sessions/${SESSION_ID}`) return json(route, session);
    if (method === 'GET' && path === `/v1/sessions/${SESSION_ID}/messages`) {
      return json(route, { messages });
    }
    if (method === 'GET' && path === '/v1/providers/lm') {
      return json(route, {
        configured: true,
        provider: 'mock_provider',
        model: 'mock-model',
      });
    }
    if (method === 'GET' && path === '/v1/workspaces') {
      return json(route, { workspaces: [] });
    }
    if (method === 'GET' && path === '/v1/providers') return json(route, { providers: [] });
    if (method === 'GET' && path === '/v1/commands') return json(route, { commands: [] });
    if (method === 'GET' && path === '/v1/permissions') return json(route, { permissions: [] });
    if (method === 'GET' && path.endsWith('/questions')) return json(route, { questions: [] });
    if (method === 'GET' && path.endsWith('/context/files')) return json(route, { files: [] });
    if (method === 'GET' && path.endsWith('/context/frames')) return json(route, { frames: [] });
    if (method === 'GET' && path.endsWith('/diffs')) return json(route, { diffs: [] });
    if (method === 'GET' && path.endsWith('/schedules')) return json(route, { schedules: [] });
    if (method === 'GET' && path.endsWith('/attempts')) return json(route, { attempts: [] });
    if (method === 'GET' && path.endsWith('/agent-blueprint')) return json(route, {});
    if (method === 'GET' && path.endsWith('/expert-pack')) return json(route, {});
    if (method === 'GET' && path === '/v1/agent-blueprints') return json(route, { blueprints: [] });
    if (method === 'GET' && path === '/v1/expert-packs') return json(route, { packs: [] });

    return json(route, {});
  });
}

async function json(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });
}

test('jump-to-latest pill never overlaps the composer, even when the pickers row wraps', async ({
  page,
}) => {
  // Keep a wide desktop viewport so the pickers row stays in `flex-wrap: wrap`
  // mode (the <=760px breakpoint switches it to nowrap+scroll, which cannot
  // reproduce the wrap-driven height growth). The wrap is forced later by
  // narrowing --chat-content-w, not the viewport.
  await page.setViewportSize({ width: 1440, height: 900 });

  await installAutoscrollBackend(page);
  await page.goto('/?route=connect');
  await page.getByTestId('connect-url').fill(MOCK_BACKEND);
  await page.getByTestId('connect-submit').click();
  await page.getByTestId(`session-row-${SESSION_ID}`).click();

  const pane = page.getByTestId('transcript-pane');
  await expect(pane).toContainText('Initial streamed paragraph 40');

  // Stream extra text so the transcript is comfortably scrollable, then pin to
  // the bottom.
  await emitSse(page, 'message.part.delta', {
    message_id: ASSISTANT_ID,
    part_id: PART_ID,
    delta: {
      text_append: `\n\n${Array.from({ length: 20 }, (_, i) => `Streamed live line ${i + 1}`).join('\n\n')}`,
    },
  });
  await expect(pane).toContainText('Streamed live line 20');
  await pane.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect.poll(() => bottomDistance(page)).toBeLessThan(4);

  // Scroll UP so the jump pill appears.
  await pane.hover();
  await page.mouse.wheel(0, -1200);
  await expect(page.getByTestId('scroll-to-bottom')).toBeVisible();
  await expect.poll(() => bottomDistance(page)).toBeGreaterThan(300);

  // Wait for the ResizeObserver to have published a real --composer-h (the
  // one-line composer measurement), then assert base-state non-overlap.
  await expect.poll(() => composerHVar(page)).toBeGreaterThan(80);
  const baseComposerH = await composerHeight(page);
  const baseComposerHVar = await composerHVar(page);
  await assertPillClearsComposer(page, 'base (one-line pickers)');

  // --- Reproduce the WRAP scenario the review found ---------------------------
  // Narrow the chat content column via --chat-content-w (the same variable the
  // real narrow/inspector-open layout drives). At 260px the composer shell is
  // too narrow for the `.composer__pickers` row, so it wraps to two lines and
  // the composer grows taller — exactly the case the static --composer-h missed.
  await page.getByTestId('chat-screen').evaluate((el) => {
    (el as HTMLElement).style.setProperty('--chat-content-w', '260px');
  });

  // Wait for the ResizeObserver to settle: the composer must have grown AND the
  // published --composer-h must have followed it (the magic-number regression
  // would leave --composer-h static here — that is the lock).
  await expect
    .poll(() => composerHeight(page), {
      message: 'composer should grow taller once the pickers row wraps',
    })
    .toBeGreaterThan(baseComposerH + 10);
  await expect
    .poll(() => composerHVar(page), {
      message: '--composer-h must re-publish to track the taller composer',
    })
    .toBeGreaterThan(baseComposerHVar + 10);

  // Pill must remain visible (we are still scrolled up) and STILL clear the now
  // taller composer.
  await expect(page.getByTestId('scroll-to-bottom')).toBeVisible();
  await assertPillClearsComposer(page, 'wrapped (two-line pickers)');
});
