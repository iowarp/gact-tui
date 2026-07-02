import { expect, test, type Page, type Route } from '@playwright/test';
import { capabilities, NOW } from './mock-backend-fixtures';

const MOCK_BACKEND = 'http://autoscroll.mock';
const SESSION_ID = 'mock-autoscroll-session';
const ASSISTANT_ID = 'm-autoscroll-asst';
const PART_ID = 'p-autoscroll-answer';

const initialText = Array.from(
  { length: 36 },
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

async function scrollTop(page: Page): Promise<number> {
  return page.getByTestId('transcript-pane').evaluate((el) => el.scrollTop);
}

async function installAutoscrollBackend(page: Page) {
  const session = {
    id: SESSION_ID,
    title: 'autoscroll streaming demo',
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
      id: 'm-autoscroll-user',
      session_id: SESSION_ID,
      role: 'user',
      created_at: NOW,
      parts: [{ type: 'text', text: 'Stream a long answer for the demo recorder.' }],
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
    const NativeEventSource = window.EventSource;
    const streams = new Set<EventTarget>();

    class TestEventSource extends EventTarget {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSED = 2;

      readonly CONNECTING = 0;
      readonly OPEN = 1;
      readonly CLOSED = 2;
      readonly url: string;
      readonly withCredentials = false;
      readyState = TestEventSource.CONNECTING;
      onopen: ((this: EventSource, ev: Event) => unknown) | null = null;
      onmessage: ((this: EventSource, ev: MessageEvent) => unknown) | null = null;
      onerror: ((this: EventSource, ev: Event) => unknown) | null = null;

      constructor(url: string | URL, eventSourceInitDict?: EventSourceInit) {
        super();
        this.url = String(url);
        if (!this.url.startsWith('http://autoscroll.mock')) {
          return new NativeEventSource(url, eventSourceInitDict) as unknown as TestEventSource;
        }
        streams.add(this);
        window.setTimeout(() => {
          if (this.readyState === TestEventSource.CLOSED) return;
          this.readyState = TestEventSource.OPEN;
          const open = new Event('open');
          this.dispatchEvent(open);
          this.onopen?.call(this as unknown as EventSource, open);
        }, 0);
      }

      close() {
        this.readyState = TestEventSource.CLOSED;
        streams.delete(this);
      }
    }

    window.addEventListener('__clio-test-sse', (raw) => {
      const detail = (raw as CustomEvent<{ type: string; data: string }>).detail;
      for (const stream of streams) {
        stream.dispatchEvent(new MessageEvent(detail.type, { data: detail.data }));
      }
    });

    window.EventSource = TestEventSource as unknown as typeof EventSource;
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

test('transcript autoscroll pins during streaming and pauses on user scroll', async ({ page }) => {
  await installAutoscrollBackend(page);
  await page.goto('/?route=connect');
  await page.getByTestId('connect-url').fill(MOCK_BACKEND);
  await page.getByTestId('connect-submit').click();
  await page.getByTestId(`session-row-${SESSION_ID}`).click();

  const pane = page.getByTestId('transcript-pane');
  await expect(pane).toContainText('Initial streamed paragraph 36');
  await pane.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect.poll(() => bottomDistance(page)).toBeLessThan(4);

  await emitSse(page, 'message.part.delta', {
    message_id: ASSISTANT_ID,
    part_id: PART_ID,
    delta: {
      text_append: `\n\n${Array.from({ length: 12 }, (_, i) => `Pinned live line ${i + 1}`).join('\n\n')}`,
    },
  });
  await expect(pane).toContainText('Pinned live line 12');
  await expect.poll(() => bottomDistance(page)).toBeLessThan(4);

  await pane.hover();
  await page.mouse.wheel(0, -900);
  await expect(page.getByTestId('scroll-to-bottom')).toBeVisible();
  // The scroll-to-bottom pill is driven by the synchronously-set `scrolledUp`
  // signal, which flips ahead of the browser actually applying the wheel scroll.
  // Wait for the scroll position to settle before capturing the paused offset so
  // the "position holds during streaming" assertion below is deterministic.
  await expect.poll(() => bottomDistance(page)).toBeGreaterThan(300);
  const pausedTop = await scrollTop(page);

  await emitSse(page, 'message.part.delta', {
    message_id: ASSISTANT_ID,
    part_id: PART_ID,
    delta: {
      text_append: `\n\n${Array.from({ length: 12 }, (_, i) => `Paused live line ${i + 1}`).join('\n\n')}`,
    },
  });
  await expect(pane).toContainText('Paused live line 12');
  await expect.poll(() => scrollTop(page)).toBe(pausedTop);
  await expect.poll(() => bottomDistance(page)).toBeGreaterThan(300);

  await page.getByTestId('scroll-to-bottom').click();
  await expect.poll(() => bottomDistance(page)).toBeLessThan(4);
  await expect(page.getByTestId('scroll-to-bottom')).toBeHidden();
});
