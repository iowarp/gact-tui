import AxeBuilder from '@axe-core/playwright';
import type { Session } from '@clio/core/v3';
import { expect, test, type Locator, type Page } from '@playwright/test';

const fixturePort = Number.parseInt(process.env['CLIO_FIXTURE_PORT'] ?? '18799', 10);
const fixtureEndpoint = `http://127.0.0.1:${fixturePort}`;
const workspaceUrl = '/workspaces/ws_flat_ndp/sessions/sess_flat_ndp';
const unexpectedErrors = new WeakMap<Page, string[]>();

async function settleConversationAtLatest(page: Page) {
  const conversation = page.getByRole('log', { name: 'Conversation' });
  await expect(conversation).toBeVisible();
  let previousHeight = -1;
  let stablePasses = 0;
  await expect
    .poll(
      async () => {
        const metrics = await conversation.evaluate((element) => {
          element.scrollTo({ behavior: 'instant', top: element.scrollHeight });
          return {
            bottomGap: element.scrollHeight - element.scrollTop - element.clientHeight,
            scrollHeight: element.scrollHeight,
          };
        });
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            ),
        );
        stablePasses =
          metrics.bottomGap <= 1 && metrics.scrollHeight === previousHeight ? stablePasses + 1 : 0;
        previousHeight = metrics.scrollHeight;
        return stablePasses;
      },
      { intervals: [50, 100, 200], timeout: 10_000 },
    )
    .toBeGreaterThanOrEqual(3);
}

async function waitForArtifactPreview(page: Page) {
  // ClioArtifactAttachments now renders every transcript artifact as the
  // compact, click-to-open row shared with the Artifacts canvas (Codex's
  // af2c40e5 "fix: unify artifact output rows" sets preview={false}
  // unconditionally there), so the inline <img> preview this helper used to
  // wait for no longer renders in the transcript -- opening it is a separate
  // affordance this test does not exercise.
  await expect(page.getByRole('button', { name: 'Open vertical-displacement.png' })).toBeVisible({
    timeout: 20_000,
  });
}

async function alignTranscriptAnchorAtTop(page: Page, anchor: Locator) {
  const conversation = page.getByRole('log', { name: 'Conversation' });
  await expect(anchor).toBeVisible();
  await expect
    .poll(() =>
      anchor.evaluate((element) => {
        const scroller = element.closest<HTMLElement>('[role="log"]');
        if (!scroller) return Number.POSITIVE_INFINITY;
        const delta = element.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        const remainingScroll = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
        if (delta > remainingScroll + 1) {
          const paddingBottom = Number.parseFloat(getComputedStyle(scroller).paddingBottom) || 0;
          scroller.style.paddingBottom = `${paddingBottom + delta - remainingScroll}px`;
        }
        scroller.scrollBy({ behavior: 'instant', top: delta });
        return Math.abs(element.getBoundingClientRect().top - scroller.getBoundingClientRect().top);
      }),
    )
    .toBeLessThanOrEqual(1);
}

async function alignLatestActivityAtTop(page: Page) {
  const conversation = page.getByRole('log', { name: 'Conversation' });
  const activityHeader = conversation.getByRole('button', { name: 'Activity' }).last();
  await alignTranscriptAnchorAtTop(page, activityHeader.locator('..'));
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  unexpectedErrors.set(page, errors);
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  const reset = await page.request.post(`${fixtureEndpoint}/__test/reset`);
  expect(reset.ok()).toBe(true);
  await page.addInitScript((endpoint) => {
    try {
      localStorage.setItem('clio.recent-connections', JSON.stringify([endpoint]));
    } catch {
      // MCP Apps intentionally use an opaque inner origin without storage access.
    }
  }, fixtureEndpoint);
});

test.afterEach(async ({ page }) => {
  expect(unexpectedErrors.get(page) ?? []).toEqual([]);
});

test('keeps Observability tabs inside the strip and scrolls only their content vertically', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto(workspaceUrl);
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => window.localStorage.setItem('theme', value), theme);
    await page.reload();
    await waitForArtifactPreview(page);
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole('button', { name: /^Evidence layout:/ }).click();
    await page.getByRole('button', { name: 'Open observability in workspace canvas' }).click();
    const canvas = page.getByRole('complementary', { name: 'Workspace canvas' });
    const resize = page.getByRole('separator', { name: 'Resize workspace canvas' });
    const resizeBounds = await resize.boundingBox();
    if (!resizeBounds) throw new Error('Workspace canvas resize handle is missing');
    await page.mouse.move(resizeBounds.x + resizeBounds.width / 2, resizeBounds.y + 20);
    await page.mouse.down();
    await page.mouse.move(960, resizeBounds.y + 20, { steps: 5 });
    await page.mouse.up();
    await expect
      .poll(async () => (await canvas.boundingBox())?.width ?? 0)
      .toBeGreaterThanOrEqual(319);
    await expect
      .poll(async () => (await canvas.boundingBox())?.width ?? 0)
      .toBeLessThanOrEqual(321);

    const strip = canvas.getByRole('tablist', { name: 'Observability view' });
    for (const mode of ['docked', 'maximized'] as const) {
      if (mode === 'maximized') {
        await canvas.getByRole('button', { name: 'Maximize canvas' }).click();
      }
      for (const label of ['Evidence', 'Timeline', 'Gantt', 'Context']) {
        const tab = strip.getByRole('tab', { name: label, exact: true });
        await tab.click();
        await expect(canvas.getByRole('tabpanel', { name: label, exact: true })).toBeVisible();
        const metrics = await strip.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return {
            verticalOverflow: element.scrollHeight - element.clientHeight,
            horizontalOverflow: element.scrollWidth - element.clientWidth,
            tabs: Array.from(element.querySelectorAll<HTMLElement>('[role="tab"]')).map(
              (child) => ({
                top: child.getBoundingClientRect().top - bounds.top,
                bottom: child.getBoundingClientRect().bottom - bounds.bottom,
                clippedLabel: child.scrollWidth - child.clientWidth,
                indicatorBottom: getComputedStyle(child, '::after').bottom,
              }),
            ),
          };
        });
        expect(metrics.verticalOverflow).toBeLessThanOrEqual(1);
        expect(metrics.horizontalOverflow).toBeLessThanOrEqual(1);
        for (const child of metrics.tabs) {
          expect(child.top).toBeGreaterThanOrEqual(0);
          expect(child.bottom).toBeLessThanOrEqual(0);
          expect(child.clippedLabel).toBeLessThanOrEqual(1);
          expect(child.indicatorBottom).toBe('0px');
        }
      }
      // A short window makes this real context content overflow in both modes.
      await page.setViewportSize({ width: 1280, height: 400 });
      const content = canvas.locator('[data-slot="scroll-area-viewport"]').first();
      await content.hover();
      await page.mouse.wheel(0, 1500);
      await expect.poll(() => content.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      await expect(strip.getByRole('tab', { name: 'Context', exact: true })).toBeInViewport();
      await page.setViewportSize({ width: 1280, height: 600 });
      await page.mouse.move(20, 580);
      await page.screenshot({ path: testInfo.outputPath(`observability-${theme}-${mode}.png`) });
    }
  }
});

test('reveals workspace creation and overflow actions without changing disclosure', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto(workspaceUrl);
  const disclosure = page.getByRole('button', {
    name: /^(?:Collapse|Expand) workspace flat-NDP$/u,
    includeHidden: true,
  });
  await expect(disclosure).toBeVisible();
  await waitForArtifactPreview(page);
  const newSession = page.getByRole('button', {
    name: 'New session in flat-NDP',
    exact: true,
    includeHidden: true,
  });
  const overflow = page.getByRole('button', {
    name: 'Workspace actions for flat-NDP',
    exact: true,
  });
  const actions = newSession.locator('..');
  await page.mouse.move(1090, 790);
  await expect(actions).toHaveCSS('opacity', '0');
  await page.screenshot({ path: testInfo.outputPath('workspace-row-at-rest.png') });
  await newSession.hover();
  await expect(actions).toHaveCSS('opacity', '1');
  await expect(page.locator('[data-slot="hover-card-content"]')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('workspace-row-hover.png') });
  await newSession.click();
  const create = page.getByRole('dialog', { name: 'Create', exact: true });
  await expect(create.getByRole('tab', { name: 'Session', exact: true })).toHaveAttribute(
    'data-state',
    'active',
  );
  await expect(create.getByRole('combobox', { name: 'Workspace', exact: true })).toHaveText(
    'flat-NDP',
  );
  await create.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  await disclosure.click();
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  await page.mouse.move(1090, 790);
  await overflow.focus();
  await expect(actions).toHaveCSS('opacity', '1');
  await overflow.click();
  const menu = page.getByRole('menu');
  await testInfo.attach('workspace-menu-trigger', {
    body: JSON.stringify(
      await actions.evaluate((element) => ({
        expandedTrigger: element.querySelector('[aria-expanded="true"]')?.outerHTML,
      })),
      null,
      2,
    ),
    contentType: 'application/json',
  });
  await expect(menu.getByRole('menuitem', { name: 'Edit workspace', exact: true })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'New session', exact: true })).toHaveCount(0);
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  await menu.getByRole('menuitem', { name: 'Edit workspace', exact: true }).hover();
  await expect(actions).toHaveCSS('opacity', '1');
  await expect(page.locator('[data-slot="hover-card-content"]')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('workspace-row-menu.png') });
});

test('keeps same-named sessions on one line and reveals details on hover or focus', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.route(/\/v1\/sessions(?:\?.*)?$/u, async (route) => {
    const response = await route.fetch();
    const payload = (await response.json()) as { sessions: Session[] };
    const original = payload.sessions[0];
    expect(original).toBeDefined();
    await route.fulfill({
      response,
      json: {
        ...payload,
        sessions: [
          { ...original, title: 'Unique session', message_count: 1 },
          {
            ...original,
            id: 'sess_sidebar_empty',
            title: 'Report and research',
            state: 'completed',
            message_count: 0,
          },
          {
            ...original,
            id: 'sess_sidebar_transcript',
            title: 'Report and research',
            state: 'completed',
            created_at: '2026-08-23T00:05:00Z',
            message_count: 7,
          },
        ],
      },
    });
  });
  await page.goto(workspaceUrl);
  const duplicates = page.getByRole('link', { name: /^Report and research/u });
  const unique = page.getByRole('link', { name: /^Unique session/u });
  await expect(duplicates).toHaveCount(2);
  await expect(unique).toBeVisible();
  const rows = [unique, duplicates.nth(0), duplicates.nth(1)];
  for (const row of rows) {
    await expect(row).not.toContainText(/messages|Started/u);
    expect(
      await row.evaluate(
        (element) => element.closest('[class~="group/row"]')?.getBoundingClientRect().height,
      ),
    ).toBe(32);
  }
  await page.screenshot({ path: testInfo.outputPath('session-rows-single-line.png') });
  const card = page.locator('[data-slot="hover-card-content"]');
  await duplicates.nth(0).hover();
  await expect(card.getByText('Started', { exact: true })).toBeVisible();
  await expect(card.getByText('No messages yet')).toBeVisible();
  await duplicates.nth(1).hover();
  await expect(card.getByText('7 messages')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('session-details-hover.png') });
  await page.mouse.move(1090, 790);
  await expect(card).toHaveCount(0);
  await unique.focus();
  await expect(card.getByText('1 message', { exact: true })).toBeVisible();
  await expect(card.getByText('Started', { exact: true })).toBeVisible();
});

test('renders structured MCP v2 interactions and one live inline App', async ({ page }) => {
  const seeded = await page.request.post(`${fixtureEndpoint}/__test/mcp-v2-ui-demo`);
  expect(seeded.ok()).toBe(true);
  const preConsentRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('mcp-clio.example.com')) preConsentRequests.push(request.url());
  });

  await page.goto(workspaceUrl);
  const attention = page.getByRole('region', { name: 'Agent needs your response' });
  await expect(attention.getByRole('button', { name: '3 responses needed' })).toBeVisible();
  await expect(page.getByText('Agent is answering MCP request')).toBeVisible();
  await expect(page.getByText('Agent answered MCP request')).toBeVisible();

  const form = attention
    .locator('[data-interaction-kind="question"]')
    .filter({ hasText: 'Choose how this evidence should be reviewed.' });
  await expect(form.getByLabel('Review brief')).toHaveValue('NDP evidence');
  await expect(form.getByLabel('Iterations')).toHaveValue('3');
  await expect(form.getByRole('radio', { name: 'Station table' })).toBeChecked();
  await expect(form.getByRole('switch', { name: 'Keep provenance visible' })).toBeChecked();
  await expect(form.getByRole('checkbox', { name: 'Coverage' })).toBeChecked();
  await form.getByLabel('Review brief').fill('');
  await form.getByRole('button', { name: 'Send response' }).click();
  await expect(form.getByText('This field is required.')).toBeVisible();
  await form.getByLabel('Review brief').fill('ab');
  await form.getByRole('button', { name: 'Send response' }).click();
  await expect(form.getByText('Enter at least 3 characters.')).toBeVisible();
  await form.getByLabel('Review brief').fill('Station evidence');
  await form.getByRole('checkbox', { name: 'Quality' }).check();
  await form.getByRole('button', { name: 'Send response' }).click();
  await expect(form).toHaveCount(0);

  const urlConsent = attention
    .locator('[data-interaction-kind="question"]')
    .filter({ hasText: 'Open the provider authorization page?' });
  await expect(urlConsent.getByText('Look-alike address warning')).toBeVisible();
  await expect(urlConsent).toContainText('ελληνικά.mcp-clio.example.com');
  await expect(urlConsent).toContainText('xn--nxasmq6b.mcp-clio.example.com');
  expect(preConsentRequests).toEqual([]);
  await urlConsent.getByRole('button', { name: 'Decline' }).click();
  await expect(urlConsent).toHaveCount(0);
  expect(preConsentRequests).toEqual([]);

  const fallback = attention
    .locator('[data-interaction-kind="question"]')
    .filter({ hasText: 'Which fallback should the review use?' });
  await expect(fallback).toContainText('The specialist could not answer this, so it needs you.');
  await fallback.getByText('Technical details').click();
  await expect(fallback.getByText('agent_answer_timeout')).toBeVisible();

  await attention.getByRole('button', { name: '1 response needed' }).click();
  await settleConversationAtLatest(page);
  const appFrame = page.locator('[data-mcp-app="app_fixture_1"]');
  await expect(appFrame.getByText('Ready', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const methods: string[] = [];
    Object.defineProperty(window, '__mcpFixtureMethods', { value: methods });
    window.addEventListener('message', (event) => {
      const method = (event.data as { method?: unknown } | null)?.method;
      if (typeof method === 'string') methods.push(`${event.origin}:${method}`);
    });
  });
  const app = page
    .frameLocator('iframe[data-mcp-app-iframe="app_fixture_1"]')
    .frameLocator('iframe[title="MCP App content"]');
  await expect(app.getByRole('button', { name: 'Inspect row 2' })).toBeVisible();
  await app.getByRole('button', { name: 'Inspect row 2' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __mcpFixtureMethods?: string[] }).__mcpFixtureMethods ?? [],
      ),
    )
    .toContain('http://127.0.0.1:18799:tools/call');
  await expect
    .poll(async () => {
      const state = await page.request.get(`${fixtureEndpoint}/__test/mcp-v2-ui-state`);
      return state.json();
    })
    .toMatchObject({ tool_calls: 1, model_context_updates: 1, messages: 1 });
  await expect(page.locator('body')).not.toContainText('selected_row');

  const replaced = await page.request.post(`${fixtureEndpoint}/__test/mcp-v2-ui-replace`);
  expect(replaced.ok()).toBe(true);
  await page.reload();
  await settleConversationAtLatest(page);
  await expect(page.getByText('MCP v2 exerciser view closed')).toBeVisible();
  await expect(page.locator('iframe[data-mcp-app-iframe="app_fixture_1"]')).toHaveCount(0);
  await expect(page.locator('iframe[data-mcp-app-iframe="app_fixture_2"]')).toHaveCount(1);
});

test('renders dense flat-NDP semantics with accessible interactions', async ({ page }) => {
  await page.goto(workspaceUrl);
  await expect(page).toHaveURL(new RegExp(`${workspaceUrl}$`));

  await expect(page.getByText('EarthScope NDP evidence review').first()).toBeVisible();
  await expect(page.getByText('flat-NDP').first()).toBeVisible();
  await waitForArtifactPreview(page);
  await expect(page.getByRole('button', { name: 'Change model' })).toContainText('Codex / Luna');
  await expect(page.getByText('D:\\science\\campaigns\\flat-NDP', { exact: true })).toHaveCount(0);
  const pendingResponses = page.getByRole('region', { name: 'Agent needs your response' });
  await expect(pendingResponses).toBeVisible();
  const pendingResponsesTrigger = pendingResponses.getByRole('button', {
    name: '2 responses needed',
  });
  await expect(pendingResponsesTrigger).toBeVisible();
  await expect(page.getByRole('button', { name: 'Allow once' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send response' })).toBeDisabled();
  await settleConversationAtLatest(page);
  const conversation = page.getByRole('log', { name: 'Conversation' });
  await expect(conversation).toHaveAttribute('data-minimap-visible', 'true');
  // The minimap is a landmark index, not a scrollbar — it has no drag and no
  // proportional thumb — so the native scrollbar stays even while it is shown.
  await expect(conversation).toHaveCSS('scrollbar-width', 'thin');
  const minimap = page.getByRole('complementary', { name: 'Transcript minimap' });
  const composerStack = page.locator('[data-slot="clio-composer-stack"]');
  await expect(composerStack).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(composerStack).toHaveCSS('background-image', 'none');
  await expect(composerStack.locator('..')).toHaveCSS('position', 'absolute');
  await expect
    .poll(async () => {
      const responseSurface = await pendingResponses.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      );
      const composerSurface = await composerStack
        .locator('[data-slot="input-group"]')
        .evaluate((element) => getComputedStyle(element).backgroundColor);
      return composerSurface === responseSurface;
    })
    .toBe(true);
  const expandedConversationBounds = await conversation.boundingBox();
  const expandedMinimapBounds = await minimap.boundingBox();
  const expandedComposerBounds = await composerStack.boundingBox();
  expect(expandedConversationBounds).not.toBeNull();
  expect(expandedMinimapBounds).not.toBeNull();
  expect(expandedComposerBounds).not.toBeNull();
  expect(expandedComposerBounds?.y ?? 0).toBeLessThan(
    (expandedConversationBounds?.y ?? 0) + (expandedConversationBounds?.height ?? 0),
  );
  expect(
    Math.abs(
      (expandedMinimapBounds?.y ?? 0) +
        (expandedMinimapBounds?.height ?? 0) -
        ((expandedConversationBounds?.y ?? 0) + (expandedConversationBounds?.height ?? 0)),
    ),
  ).toBeLessThanOrEqual(16);
  await expect
    .poll(async () => {
      const composer = await composerStack.boundingBox();
      const paddingBottom = await conversation.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).paddingBottom),
      );
      return Math.abs(paddingBottom - (composer?.height ?? 0));
    })
    .toBeLessThanOrEqual(2);
  await pendingResponsesTrigger.click();
  await expect(
    pendingResponses.getByText('Read the station evidence table', { exact: true }),
  ).not.toBeVisible();
  await expect
    .poll(async () => (await composerStack.boundingBox())?.height ?? Number.POSITIVE_INFINITY)
    .toBeLessThan((expandedComposerBounds?.height ?? 0) - 100);
  await expect
    .poll(async () =>
      Math.abs(
        ((await conversation.boundingBox())?.height ?? 0) -
          (expandedConversationBounds?.height ?? 0),
      ),
    )
    .toBeLessThanOrEqual(2);
  await expect
    .poll(async () =>
      Math.abs(((await minimap.boundingBox())?.height ?? 0) - (expandedMinimapBounds?.height ?? 0)),
    )
    .toBeLessThanOrEqual(2);
  await pendingResponsesTrigger.click();
  const approvalTitle = pendingResponses.getByText('Read the station evidence table', {
    exact: true,
  });
  await expect(approvalTitle).toBeVisible();
  const approvalIcon = pendingResponses.getByRole('alert').locator('svg').first();
  await expect
    .poll(async () => {
      const titleBounds = await approvalTitle.boundingBox();
      const iconBounds = await approvalIcon.boundingBox();
      if (!titleBounds || !iconBounds) return false;
      return (
        Math.abs(titleBounds.y + titleBounds.height / 2 - (iconBounds.y + iconBounds.height / 2)) <=
        2
      );
    })
    .toBe(true);
  await settleConversationAtLatest(page);
  // #1339 appended a compaction checkpoint message to the shared fixture
  // transcript, shifting every landmark after it by one (999 -> the
  // checkpoint itself, 1000 -> the fixture request, 1001 -> the active
  // streaming turn).
  const activeLandmark = page.getByRole('button', { name: 'Jump to assistant message 1001' });
  await expect(activeLandmark).toHaveAttribute('aria-current', 'location');
  await expect(minimap).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(minimap).toHaveCSS('box-shadow', 'none');
  await expect(minimap).toHaveCSS('width', '28px');
  await expect
    .poll(async () => {
      const rail = await minimap.boundingBox();
      const landmark = await activeLandmark.boundingBox();
      if (!rail || !landmark) return false;
      return Math.abs(rail.y + rail.height - (landmark.y + landmark.height)) <= 2;
    })
    .toBe(true);
  const activeMarker = activeLandmark.locator('[data-slot="transcript-minimap-landmark"]');
  await expect(activeMarker).toHaveCSS('width', '24px');
  await expect(activeMarker).toHaveCSS('height', '4px');
  await expect(activeMarker).toHaveCSS('opacity', '1');
  const previousLandmark = minimap.getByRole('button', {
    exact: true,
    name: 'Jump to user message 1000',
  });
  const previousMarker = previousLandmark.locator('[data-slot="transcript-minimap-landmark"]');
  await expect(previousMarker).toHaveCSS('width', '12px');
  await expect(previousMarker).toHaveCSS('height', '2px');
  await expect(previousMarker).toHaveCSS('opacity', '0.6');
  await previousLandmark.hover();
  await expect(previousMarker).toHaveCSS('width', '24px');
  await expect(previousMarker).toHaveCSS('height', '4px');
  await expect(previousMarker).toHaveCSS('opacity', '1');
  const previousBounds = await previousLandmark.boundingBox();
  const activeBounds = await activeLandmark.boundingBox();
  expect(previousBounds).not.toBeNull();
  expect(activeBounds).not.toBeNull();
  expect(
    Math.abs((previousBounds?.y ?? 0) + (previousBounds?.height ?? 0) - (activeBounds?.y ?? 0)),
  ).toBeLessThanOrEqual(1);

  const minimapBounds = await minimap.boundingBox();
  expect(minimapBounds).not.toBeNull();
  const conversationScrollTop = await conversation.evaluate((element) => element.scrollTop);
  if (minimapBounds) {
    await page.mouse.move(
      minimapBounds.x + minimapBounds.width / 2,
      minimapBounds.y + minimapBounds.height / 2,
    );
    await page.mouse.wheel(0, -50_000);
  }
  const firstRailLandmark = minimap.getByRole('button', {
    exact: true,
    name: 'Jump to user message 1',
  });
  await expect(firstRailLandmark).toBeVisible();
  await firstRailLandmark.hover();
  const railPreview = page.locator('[data-slot="hover-card-content"]');
  await expect(railPreview.locator('[data-streamdown="strong"]')).toContainText('evidence ledger');
  await expect(railPreview.getByText(/\*\*evidence ledger\*\*/)).toHaveCount(0);
  await expect
    .poll(() => conversation.evaluate((element) => element.scrollTop))
    .toBe(conversationScrollTop);
  if (minimapBounds) await page.mouse.wheel(0, 50_000);
  // Wheel dispatch is asynchronous on Linux Chromium. Seeing the last rail
  // marker only proves that the minimap itself is present; it does not prove
  // the transcript finished returning to its latest anchor. Re-settle the
  // native scroll container, then pin the final semantic block to the viewport
  // edge so the screenshot cannot alternate between the attachment and Activity
  // rows above it.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await settleConversationAtLatest(page);
  await expect(activeLandmark).toHaveAttribute('aria-current', 'location');
  await alignLatestActivityAtTop(page);
  await page.mouse.move(600, 30);
  await expect(page.locator('[data-slot="hover-card-content"]')).toHaveCount(0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await alignLatestActivityAtTop(page);
  // maxDiffPixels absorbs sub-row anti-aliasing jitter at the latest-anchored
  // transcript's top edge (~400px originally observed); a real layout
  // regression moves orders of magnitude more (tens of thousands of pixels,
  // not low thousands). Widened from 1500: the #1533 coordinator review's
  // detached-surface spacing fix shifts this exact region on purpose, and
  // live CI (github.com/iowarp/gact-tui/actions, ubuntu-22.04) showed up to
  // ~2858px of font-rasterization drift here even against a baseline
  // regenerated on a real Linux box (WSL Ubuntu 24.04, then the official
  // mcr.microsoft.com/playwright:v1.62.1-jammy image) — both of which
  // independently render this exact capture with ZERO diff against the
  // current baseline, so the extra drift is specifically the live runner's
  // own apt-installed font packages moving between when an image is built
  // and when `playwright install --with-deps` runs, not a baseline chosen
  // to paper over a real difference.
  await expect(page).toHaveScreenshot('workspace-desktop-dark.png', {
    animations: 'allow',
    maxDiffPixels: 3500,
  });

  await page.getByRole('button', { name: 'Open workspace canvas' }).click();
  const canvas = page.getByRole('complementary', { name: 'Workspace canvas' });
  await expect(canvas).toBeVisible();
  const observabilityTab = canvas.getByRole('tab', { name: 'Observability' });
  // The X on a tab is a pointer affordance only. A tablist may own nothing but
  // tabs and a tab's children are presentational, so an interactive close
  // control is a critical violation on either side of the trigger; assistive
  // tech closes the tab through the Delete shortcut announced with it. It stays
  // faintly visible at rest because touch has no hover to reveal it.
  const observabilityClose = observabilityTab
    .locator('..')
    .locator('[data-slot="canvas-tab-close"]');
  // Tabs are now drag-reorderable (@dnd-kit/sortable); the announced
  // shortcuts grew the keyboard equivalent alongside Delete.
  await expect(observabilityTab).toHaveAttribute(
    'aria-keyshortcuts',
    'Delete Alt+ArrowLeft Alt+ArrowRight',
  );
  await expect(observabilityClose).toHaveAttribute('aria-hidden', 'true');
  await expect(canvas.getByRole('button', { name: /^Close / })).toHaveCount(0);
  await expect(observabilityClose).toHaveCSS('opacity', '0.7');
  await observabilityTab.hover();
  await expect(observabilityClose).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: 'Maximize canvas' }).click();
  await expect(canvas).toHaveCSS('position', 'fixed');
  const canvasBounds = await canvas.boundingBox();
  const viewport = page.viewportSize();
  expect(canvasBounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(Math.abs((canvasBounds?.width ?? 0) - (viewport?.width ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((canvasBounds?.height ?? 0) - (viewport?.height ?? 0))).toBeLessThanOrEqual(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Maximize canvas' })).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.getByRole('button', { name: 'Allow once' }).click();
  await expect(page.getByText('Read the station evidence table')).toHaveCount(0);

  await page.getByRole('radio', { name: /Station table/ }).click();
  await page.getByRole('button', { name: 'Send response' }).click();
  await expect(page.getByText('Which evidence view should remain primary?')).toHaveCount(0);
});

test('keeps a pending EarthScope map flat, resizable, and available full-window', async ({
  page,
}) => {
  const seeded = await page.request.post(`${fixtureEndpoint}/__test/a2ui-map-demo`, {
    data: { enabled: true },
  });
  expect(seeded.ok()).toBe(true);

  await page.goto(workspaceUrl);
  await expect(page).toHaveURL(new RegExp(`${workspaceUrl}$`));
  const pendingResponses = page.getByRole('region', { name: 'Agent needs your response' });
  await expect(
    pendingResponses.getByText('Choose one observed station to continue.'),
  ).toBeVisible();
  await expect(pendingResponses.getByText('Generated UI')).toHaveCount(0);
  await expect(
    pendingResponses.getByRole('group', { name: 'Nearest EarthScope GNSS stations' }),
  ).toBeVisible();
  // The map now renders directly in the tray, without another framed box.
  await expect(pendingResponses.locator('[data-slot="a2ui-map"]')).toHaveCount(1);
  await expect(pendingResponses.locator('[data-slot="frame"].border')).toHaveCount(0);

  // A wheel over the map's own canvas must never scroll the page (which
  // would fight the map for the gesture) — a real browser check, not a
  // synthetic-event spy, since only a real compositor honors preventDefault.
  const mapGroup = pendingResponses.getByRole('group', {
    name: 'Nearest EarthScope GNSS stations',
  });
  const mapBox = await mapGroup.boundingBox();
  expect(mapBox).not.toBeNull();
  if (mapBox) {
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await page.mouse.move(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
    await page.mouse.wheel(0, 600);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  }

  const viewport = pendingResponses.locator('[data-slot="a2ui-response-viewport"]');
  const initialHeight = await viewport.evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  await pendingResponses.getByRole('button', { name: 'Resize interactive surface' }).click();
  await expect
    .poll(() => viewport.evaluate((element) => element.getBoundingClientRect().height))
    .toBeGreaterThan(initialHeight);

  const griped = await viewport.evaluate((element) => element.getBoundingClientRect().height);
  const corner = pendingResponses.getByRole('button', {
    name: 'Corner resize handle',
  });
  await expect(corner).toBeVisible();
  await corner.scrollIntoViewIfNeeded();
  const cornerBox = await corner.boundingBox();
  expect(cornerBox).not.toBeNull();
  if (cornerBox) {
    const cornerX = cornerBox.x + cornerBox.width / 2;
    const cornerY = cornerBox.y + cornerBox.height / 2;
    await page.mouse.move(cornerX, cornerY);
    await page.mouse.down();
    await page.mouse.move(cornerX, cornerY - 15, { steps: 5 });
    await page.mouse.move(cornerX, cornerY - 30, { steps: 5 });
    await page.mouse.up();
    await expect
      .poll(() => viewport.evaluate((element) => element.getBoundingClientRect().height))
      .toBeLessThan(griped);
  }
  const beforeFullscreenHeight = await viewport.evaluate(
    (element) => element.getBoundingClientRect().height,
  );

  await pendingResponses
    .getByRole('button', { name: 'Open interactive surface full screen' })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Choose one observed station to continue.');
  await expect(
    dialog.getByRole('group', { name: 'Nearest EarthScope GNSS stations' }),
  ).toBeVisible();
  const dialogBounds = await dialog.boundingBox();
  const mapBounds = await dialog
    .getByRole('group', { name: 'Nearest EarthScope GNSS stations' })
    .boundingBox();
  const pageSize = page.viewportSize();
  expect(dialogBounds?.width ?? 0).toBeGreaterThan((pageSize?.width ?? 0) * 0.9);
  expect(dialogBounds?.height ?? 0).toBeGreaterThan((pageSize?.height ?? 0) * 0.9);
  expect(mapBounds?.height ?? 0).toBeGreaterThan((pageSize?.height ?? 0) * 0.75);

  await page.getByRole('button', { name: 'Exit full screen' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // The inline viewport keeps whatever height it had before fullscreen —
  // fullscreen never resets it.
  await expect
    .poll(() => viewport.evaluate((element) => element.getBoundingClientRect().height))
    .toBe(beforeFullscreenHeight);
  const reset = await page.request.post(`${fixtureEndpoint}/__test/a2ui-map-demo`, {
    data: { enabled: false },
  });
  expect(reset.ok()).toBe(true);
});

test('keeps navigation and workspace canvas accessible on mobile with reduced motion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 900 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('theme', 'light'));
  await page.goto(workspaceUrl);

  await expect(page.locator('html')).toHaveClass(/light/);
  await expect(page.getByRole('button', { name: 'Open workspace canvas' })).toBeVisible();
  await waitForArtifactPreview(page);
  // Capture a settled transcript. Without this the shot races the scroll to the
  // latest turn, so the last messages land a few pixels off and the scroll-to-bottom
  // affordance is present in some runs and gone in others — a baseline that
  // matches about half the time.
  await settleConversationAtLatest(page);
  await alignTranscriptAnchorAtTop(page, page.locator('[data-slot="sub-agent-dispatch"]'));
  await expect(page).toHaveScreenshot('workspace-mobile-light-reduced.png', {
    animations: 'disabled',
    maxDiffPixels: 1500,
  });

  await page.getByRole('button', { name: 'Open transcript outline' }).click();
  const outline = page.getByRole('dialog', { name: 'Transcript outline' });
  await expect(outline).toBeVisible();
  await expect(outline).toHaveCSS('resize', 'both');
  expect(await outline.locator('[data-index]').count()).toBeLessThan(30);
  const finalOutlineRow = outline.locator('[data-index="999"]');
  await expect(finalOutlineRow).toBeVisible();
  await expect(finalOutlineRow.locator('p')).toHaveCSS('white-space', 'nowrap');
  expect((await finalOutlineRow.boundingBox())?.height ?? 0).toBeLessThanOrEqual(36);
  const outlineBounds = await outline.boundingBox();
  expect(outlineBounds).not.toBeNull();
  if (outlineBounds) {
    await page.mouse.move(
      outlineBounds.x + outlineBounds.width - 2,
      outlineBounds.y + outlineBounds.height - 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      outlineBounds.x + outlineBounds.width + 62,
      outlineBounds.y + outlineBounds.height + 42,
      { steps: 8 },
    );
    await page.mouse.up();
    const resizedBounds = await outline.boundingBox();
    expect(resizedBounds?.width ?? 0).toBeGreaterThan(outlineBounds.width + 40);
    expect(resizedBounds?.height ?? 0).toBeGreaterThan(outlineBounds.height + 20);
  }
  await outline.locator('[data-slot="transcript-outline-list"]').evaluate((element) => {
    element.scrollTop = 0;
  });
  const firstOutlineItem = outline.getByRole('button', {
    exact: true,
    name: 'Jump to user message 1',
  });
  await expect(firstOutlineItem).toBeVisible();
  await expect(outline.locator('[data-streamdown="strong"]')).toContainText('evidence ledger');
  await expect(outline.getByText(/\*\*evidence ledger\*\*/)).toHaveCount(0);
  await firstOutlineItem.hover();
  const firstMessagePreview = page.getByRole('region', { name: 'user message 1 preview' });
  await expect(firstMessagePreview).toContainText('Sanitized evidence ledger entry 1.');
  await firstOutlineItem.click();
  await expect(firstMessagePreview).toHaveCount(0);
  await expect(outline).toHaveCount(0);

  await page.getByRole('button', { name: 'Open workspace canvas' }).click();
  await expect(page.getByRole('dialog', { name: 'Workspace canvas' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Observability' })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Workspace canvas' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
  await expect(page.getByRole('dialog', { name: 'Sidebar' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Workspace navigation' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Sidebar' })).toHaveCount(0);
});

test('renders the discovered catalog and the steer the service is holding', async ({ page }) => {
  await page.goto(workspaceUrl);

  // The service holds one accepted-but-undelivered steer on a transcript
  // message, so that message offers to cancel it before delivery.
  await expect(page.getByRole('button', { name: 'Cancel pending message' })).toHaveCount(1);

  await page.getByRole('button', { name: 'Change model' }).click();
  const picker = page.getByRole('dialog', { name: 'Choose a model' });
  await expect(picker).toBeVisible();
  // Both live providers reach the picker: the one that answered with models,
  // and the one that answered with a failure and none.
  await expect(picker.getByText('LM Studio', { exact: true })).toBeVisible();
  await expect(picker.getByText('Argonne ALCF', { exact: true })).toBeVisible();
  await picker.getByText('LM Studio', { exact: true }).click();
  await expect(picker.getByText('qwen3-30b', { exact: true })).toBeVisible();
  await expect(picker.getByText('qwen3-vl-8b', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('renders a ghost queue stack and reconciles a live server update', async ({ page }) => {
  const seeded = await page.request.post(`${fixtureEndpoint}/__test/queue-demo`);
  expect(seeded.ok()).toBe(true);
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  await page.goto(workspaceUrl);

  await expect(page.locator('html')).toHaveClass(/dark/);
  const queue = page.locator('[aria-label="Queued messages"]:visible');
  // The welcome and conversation branches cross-fade through AnimatePresence and
  // each carries its own composer, so two queue panels are on screen until that
  // exit finishes. Settle on one before driving it.
  await expect(queue).toHaveCount(1);
  await expect(queue).toBeVisible();
  await expect(queue.getByText('6 queued messages')).toBeVisible();
  await expect(queue.locator('[data-queue-live-item]')).toHaveCount(6);
  await expect(queue).toHaveCSS('backdrop-filter', /blur/);
  await expect(
    queue.getByRole('button', { name: 'Reorder queued message', exact: true }).first(),
  ).toBeVisible();
  await expect(
    queue.getByRole('button', { name: 'Reorder queued message', exact: true }),
  ).toHaveCount(6);
  await expect(queue.locator('[data-slot="sortable"]')).toBeVisible();
  await expect(queue.locator('[draggable="true"]')).toHaveCount(0);
  const queueViewport = queue.getByRole('region', { name: '6 queued messages' });
  await expect(queueViewport).toBeVisible();
  const queueScrollRange = await queueViewport.evaluate(
    (element) => element.scrollHeight - element.clientHeight,
  );
  expect(queueScrollRange).toBeGreaterThan(0);
  await queueViewport.hover();
  await page.mouse.wheel(0, 500);
  await expect
    .poll(() => queueViewport.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await queueViewport.evaluate((element) => {
    element.scrollTop = 0;
  });
  await queueViewport.focus();
  await page.keyboard.press('PageDown');
  await expect
    .poll(() => queueViewport.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await queueViewport.evaluate((element) => {
    element.scrollTop = 0;
  });
  // "Working" is rendered twice on purpose: the dock's visible status badge and
  // the persistent sr-only live region that mirrors it so a status change is
  // announced. Scope to the dock button, which the live region sits outside of.
  const observabilityDock = page.getByRole('button', {
    name: /^Evidence layout:/,
  });
  await expect(observabilityDock.getByText('Working', { exact: true })).toBeVisible();
  await expect(page.getByText('Running', { exact: true })).toHaveCount(0);
  // The session row carries one indicator and attention outranks activity, so
  // this running session shows what it is waiting for rather than a spinner.
  await expect(page.getByRole('status', { name: /^Needs your response:/ })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Working now' })).toHaveCount(0);

  const fourthHandle = queue
    .getByRole('button', { name: 'Reorder queued message', exact: true })
    .nth(3);
  // The queue viewport is bounded and this row sits below its fold. A clipped
  // element still reports its layout box, so measuring without scrolling first
  // yields a point that belongs to whatever is painted there — the composer —
  // and the drag lands on that instead of on the handle.
  await fourthHandle.scrollIntoViewIfNeeded();
  const fourthHandleBounds = await fourthHandle.boundingBox();
  expect(fourthHandleBounds).not.toBeNull();
  await page.mouse.move(
    (fourthHandleBounds?.x ?? 0) + (fourthHandleBounds?.width ?? 0) / 2,
    (fourthHandleBounds?.y ?? 0) + (fourthHandleBounds?.height ?? 0) / 2,
  );
  await page.mouse.down();
  await page.mouse.move((fourthHandleBounds?.x ?? 0) + 4, 1, { steps: 16 });
  await page.mouse.up();
  await expect(queue.locator('[data-queue-live-item]').first()).toContainText(
    'Check why the PDF viewer is always paged.',
  );

  const appended = await page.request.post(`${fixtureEndpoint}/__test/queue-append`);
  expect(appended.ok()).toBe(true);
  await expect(queue.getByText('7 queued messages')).toBeVisible();
  await expect(queue.getByText('New server update joined the queue.')).toBeVisible();
  await expect(queue.locator('[data-queue-live-item]')).toHaveCount(7);
  // dnd-kit's drop animation temporarily dims the moved row to 0.4. Audit
  // the settled queue, after that style is restored, rather than a drag frame.
  const movedRow = queue.locator('[data-queue-live-item][data-value="queue_pdf"]');
  await expect(movedRow).toHaveAttribute('data-dragging', 'false');
  await expect(movedRow).toHaveCSS('opacity', '1');
  expect(
    (await new AxeBuilder({ page }).include('[aria-label="Queued messages"]').analyze()).violations,
  ).toEqual([]);
});

test('scrolls pending responses and queued messages independently at a narrow viewport', async ({
  page,
}) => {
  // Short as well as narrow. The queue has its own 136 px bound and the
  // pending-response stack has a responsive viewport bound, so both must keep
  // wheel and keyboard scrolling local when they compete for composer space.
  await page.setViewportSize({ height: 720, width: 848 });
  const seeded = await page.request.post(`${fixtureEndpoint}/__test/queue-demo`);
  expect(seeded.ok()).toBe(true);
  await page.goto(workspaceUrl);

  const pendingResponses = page.getByRole('region', { name: 'Agent needs your response' });
  const queue = page.locator('[aria-label="Queued messages"]:visible');
  // Both panels belong to the composer, which the welcome-to-conversation
  // cross-fade briefly mounts twice. Settle on one of each before measuring.
  await expect(pendingResponses).toHaveCount(1);
  await expect(queue).toHaveCount(1);
  const responseViewport = pendingResponses.getByRole('region', { name: '2 pending responses' });
  const queueViewport = queue.getByRole('region', { name: '6 queued messages' });

  for (const viewport of [responseViewport, queueViewport]) {
    await expect(viewport).toBeVisible();
    expect(
      await viewport.evaluate((element) => element.scrollHeight - element.clientHeight),
    ).toBeGreaterThan(0);
    await viewport.hover();
    await page.mouse.wheel(0, 500);
    await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await viewport.evaluate((element) => {
      element.scrollTop = 0;
    });
    await viewport.focus();
    await page.keyboard.press('PageDown');
    await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  }

  // Independently: a wheel over the queue stays in the queue rather than
  // chaining into the responses stacked above it. Read the responses' offset
  // only once it has stopped moving — the keyboard scroll above animates, and
  // sampling mid-flight would compare against a position it was leaving.
  let previousResponseScroll = -1;
  await expect
    .poll(async () => {
      const current = await responseViewport.evaluate((element) => element.scrollTop);
      const settled = current === previousResponseScroll;
      previousResponseScroll = current;
      return settled;
    })
    .toBe(true);
  await queueViewport.evaluate((element) => {
    element.scrollTop = 0;
  });
  await queueViewport.hover();
  await page.mouse.wheel(0, 2_000);
  await expect
    .poll(() => queueViewport.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  expect(await responseViewport.evaluate((element) => element.scrollTop)).toBe(
    previousResponseScroll,
  );
});

test('batches a 100-delta stream over a virtualized 1,000-message transcript', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    window.__clioLongTasks = [];
    window.__clioLongFrames = [];
  });
  await page.goto(workspaceUrl);
  await expect(page.getByRole('log', { name: 'Conversation' })).toBeVisible();
  // The conversation shell mounts before its snapshot finishes decoding.
  // Start the measurement only once the active message is actually mounted.
  await expect(
    page.getByRole('log', { name: 'Conversation' }).locator('[aria-busy="true"]'),
  ).toBeAttached();

  const renderedRows = page.locator('[data-index]');
  expect(await renderedRows.count()).toBeGreaterThan(0);
  expect(await renderedRows.count()).toBeLessThan(50);

  await page.getByRole('log', { name: 'Conversation' }).evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.getByRole('log', { name: 'Conversation' }).evaluate((element) => {
    window.__clioLongTasks = [];
    window.__clioLongFrames = [];
    window.__clioAnimationFrames = 0;
    window.__clioStreamMutationBatches = 0;
    window.__clioTranscriptMutationBatches = 0;
    const countAnimationFrame = () => {
      window.__clioAnimationFrames += 1;
      window.requestAnimationFrame(countAnimationFrame);
    };
    window.requestAnimationFrame(countAnimationFrame);
    const longTaskObserver = new PerformanceObserver((list) => {
      window.__clioLongTasks.push(...list.getEntries().map((entry) => entry.duration));
    });
    longTaskObserver.observe({ type: 'longtask' });
    // Long Animation Frames name the script behind a long task (entry point,
    // source URL, function, duration), so a failure below says whose work it
    // was instead of only how long it took.
    const longFrameObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceLongAnimationFrameTiming[]) {
        if (entry.duration <= 50) continue;
        window.__clioLongFrames.push({
          startTime: Math.round(entry.startTime),
          duration: Math.round(entry.duration),
          blockingDuration: Math.round(entry.blockingDuration),
          scripts: entry.scripts.map((script) => ({
            invoker: script.invoker,
            invokerType: script.invokerType,
            sourceURL: script.sourceURL,
            sourceFunctionName: script.sourceFunctionName,
            sourceCharPosition: script.sourceCharPosition,
            duration: Math.round(script.duration),
            forcedStyleAndLayoutDuration: Math.round(script.forcedStyleAndLayoutDuration),
          })),
        });
      }
    });
    longFrameObserver.observe({ type: 'long-animation-frame' });
    const transcriptObserver = new MutationObserver(() => {
      window.__clioTranscriptMutationBatches += 1;
    });
    transcriptObserver.observe(element, { characterData: true, childList: true, subtree: true });
    const streamingText = element.querySelector('[aria-busy="true"]');
    if (!streamingText) throw new Error('Active streaming text was not mounted');
    const streamObserver = new MutationObserver(() => {
      window.__clioStreamMutationBatches += 1;
    });
    streamObserver.observe(streamingText, { characterData: true, childList: true, subtree: true });
  });

  const start = await page.request.post(`${fixtureEndpoint}/__test/start-stream`);
  expect(start.ok()).toBe(true);
  // Wait on a cheap textContent read. A text-selector poll (getByText) runs
  // Playwright's selector engine in the page, computing styles across the
  // transcript on every retry, and those retries were measured as long tasks
  // of their own -- the harness, not the app. Visibility is asserted after
  // the measurements are read.
  await page.waitForFunction(
    () =>
      document
        .querySelector('[role="log"][aria-label="Conversation"]')
        ?.textContent?.includes('delta-99') ?? false,
    undefined,
    { polling: 100, timeout: 10_000 },
  );

  const measurements = await page
    .getByRole('log', { name: 'Conversation' })
    .evaluate((element) => ({
      bottomGap: element.scrollHeight - element.scrollTop - element.clientHeight,
      animationFrames: window.__clioAnimationFrames,
      longTasks: window.__clioLongTasks,
      streamMutationBatches: window.__clioStreamMutationBatches,
      transcriptMutationBatches: window.__clioTranscriptMutationBatches,
    }));
  const longFrames = await page.evaluate(() => window.__clioLongFrames);
  if (longFrames.length) {
    await testInfo.attach('long-animation-frames', {
      body: JSON.stringify(longFrames, null, 2),
      contentType: 'application/json',
    });
  }
  expect(
    measurements.longTasks.filter((duration) => duration > 50),
    `long tasks during the delta burst; long animation frames:\n${describeLongFrames(longFrames)}`,
  ).toEqual([]);
  await expect(page.getByText(/delta-99/)).toBeVisible();
  expect(measurements.streamMutationBatches).toBeGreaterThan(0);
  expect(measurements.streamMutationBatches).toBeLessThanOrEqual(100);
  expect(measurements.streamMutationBatches).toBeLessThanOrEqual(measurements.animationFrames + 2);
  expect(measurements.transcriptMutationBatches).toBeLessThan(100);
  expect(Math.abs(measurements.bottomGap)).toBeLessThanOrEqual(2);
});

test('shows the summarization injection collapsed with a clamped preview, then expands it', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(workspaceUrl);
  await expect(page).toHaveURL(new RegExp(`${workspaceUrl}$`));
  await settleConversationAtLatest(page);

  const compactionRow = page.locator(
    '[data-slot="harness-injection"][data-source="summarization"]',
  );
  await expect(compactionRow).toBeVisible();
  await expect(compactionRow.getByText(/gave the agent: Summarization/)).toBeVisible();
  await expect(compactionRow.getByText('Automatic')).toBeVisible();

  // Collapsed: a clamped preview of the summary the agent received, not an
  // empty row — the checkpoint appends to the transcript, it does not hide it.
  const preview = compactionRow.locator('p.line-clamp-3');
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('EarthScope station evidence ledger');
  // Scroll the row to the top of the viewport: it sits near the tail of the
  // transcript, close enough to the composer that the floating "Agent needs
  // your response" queue (docked at the bottom) would otherwise cover it.
  await compactionRow.evaluate((element) =>
    element.scrollIntoView({ behavior: 'instant', block: 'start' }),
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(compactionRow).toHaveScreenshot('summarization-row-collapsed.png', {
    animations: 'disabled',
  });

  await compactionRow.getByRole('button', { name: 'Show more' }).click();
  await expect(compactionRow.locator('p.line-clamp-3')).toHaveCount(0);
  await expect(
    compactionRow.getByText(/derived displacement series before this checkpoint/),
  ).toBeVisible();
  await expect(compactionRow.getByRole('button', { name: 'Show less' })).toBeVisible();
});

interface LongFrameRecord {
  startTime: number;
  duration: number;
  blockingDuration: number;
  scripts: {
    invoker: string;
    invokerType: string;
    sourceURL: string;
    sourceFunctionName: string;
    sourceCharPosition: number;
    duration: number;
    forcedStyleAndLayoutDuration: number;
  }[];
}

/** One line per long frame, naming its heaviest scripts (or that none were attributed). */
function describeLongFrames(frames: readonly LongFrameRecord[]): string {
  return frames
    .map((frame) => {
      const scripts = [...frame.scripts]
        .sort((left, right) => right.duration - left.duration)
        .slice(0, 3)
        .map(
          (script) =>
            `${script.duration}ms ${script.invokerType} ${script.invoker} ` +
            `${script.sourceFunctionName || '(anonymous)'} ` +
            `${script.sourceURL.split('/').pop() ?? ''}:${script.sourceCharPosition}`,
        );
      return (
        `  ${frame.duration}ms frame at ${frame.startTime}ms (blocking ${frame.blockingDuration}ms): ` +
        (scripts.length
          ? scripts.join(' | ')
          : 'no page script attributed (style, layout, or harness)')
      );
    })
    .join('\n');
}

declare global {
  interface PerformanceScriptTiming extends PerformanceEntry {
    invoker: string;
    invokerType: string;
    sourceURL: string;
    sourceFunctionName: string;
    sourceCharPosition: number;
    forcedStyleAndLayoutDuration: number;
  }
  interface PerformanceLongAnimationFrameTiming extends PerformanceEntry {
    blockingDuration: number;
    scripts: PerformanceScriptTiming[];
  }
  interface Window {
    __clioLongFrames: LongFrameRecord[];
    __clioLongTasks: number[];
    __clioAnimationFrames: number;
    __clioStreamMutationBatches: number;
    __clioTranscriptMutationBatches: number;
  }
}
