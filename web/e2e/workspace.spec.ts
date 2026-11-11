import AxeBuilder from '@axe-core/playwright';
import { providerComponentsSchema, type Session } from '@clio/core/v3';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  fixtureEndpoint,
  setupWorkspaceBrowser,
  openConversationRail,
  showWorkbenchList,
  workspaceUrl,
} from './workspace-setup';

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
  await expect(anchor).toBeVisible();
  const conversation = page.getByRole('log', { name: 'Conversation' });
  // Navigate as a reader before positioning the screenshot. Direct DOM
  // scrolling alone leaves following engaged and can scroll into our padding.
  await conversation.press('ArrowUp');
  await conversation.evaluate((element) => element.blur());
  let stablePasses = 0;
  await expect
    .poll(async () => {
      await anchor.evaluate((element) => {
        const scroller = element.closest<HTMLElement>('[role="log"]');
        if (!scroller) return Number.POSITIVE_INFINITY;
        const delta = element.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        const remainingScroll = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
        if (delta > remainingScroll + 1) {
          const paddingBottom = Number.parseFloat(getComputedStyle(scroller).paddingBottom) || 0;
          scroller.style.paddingBottom = `${paddingBottom + delta - remainingScroll}px`;
        }
        scroller.scrollBy({ behavior: 'instant', top: delta });
      });
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      const offset = await anchor.evaluate((element) => {
        const scroller = element.closest<HTMLElement>('[role="log"]');
        return scroller
          ? Math.abs(element.getBoundingClientRect().top - scroller.getBoundingClientRect().top)
          : Number.POSITIVE_INFINITY;
      });
      stablePasses = offset <= 1 ? stablePasses + 1 : 0;
      return stablePasses;
    })
    .toBeGreaterThanOrEqual(3);
}

async function alignLatestActivityAtTop(page: Page) {
  const conversation = page.getByRole('log', { name: 'Conversation' });
  const activityLane = conversation.getByRole('group', { name: /^Activity:/ }).last();
  await alignTranscriptAnchorAtTop(page, activityLane);
}

/**
 * Each region keeps the former whole-page pixel budget. Text anti-aliasing
 * jitter does not shrink with the region, and a regression confined to one
 * surface must still move as many pixels as it did on the whole page.
 */
const desktopMaxDiffPixels = 3500;
const mobileMaxDiffPixels = 1500;

type ScreenshotBudget = { animations: 'allow' | 'disabled'; maxDiffPixels: number };

/**
 * Compare one surface against its own baseline. A soft assertion lets one run
 * report every changed region.
 */
async function expectRegionScreenshot(
  region: Locator,
  name: string,
  { animations, maxDiffPixels, mask = [] }: ScreenshotBudget & { mask?: Locator[] },
) {
  await expect(region).toBeVisible();
  await expect.soft(region).toHaveScreenshot(name, {
    animations,
    mask,
    maskColor: '#ff00ff',
    maxDiffPixels,
  });
}

type WorkspaceRegion = 'left-bar' | 'header' | 'transcript' | 'attention' | 'composer';

/**
 * Review each workspace surface against its own baseline, so restyling one
 * surface does not invalidate the others. The composer stack (attention tray
 * and composer) floats over the transcript, so each shot masks the surface it
 * does not own.
 */
async function expectWorkspaceRegions(
  page: Page,
  prefix: string,
  regions: readonly WorkspaceRegion[],
  budget: ScreenshotBudget,
) {
  const attention = page.getByRole('region', { name: 'Agent needs your attention' });
  const composerStack = page.locator('[data-slot="clio-composer-stack"]');
  const surfaces: Record<WorkspaceRegion, { region: Locator; mask: Locator[] }> = {
    'left-bar': {
      region: page.getByRole('navigation', { name: 'Workspace navigation' }),
      mask: [],
    },
    header: { region: page.locator('[data-slot="workspace-header"]'), mask: [] },
    transcript: {
      region: page.locator('[data-slot="session-transcript"]'),
      // The Thinking row counts seconds from mount, so its time differs per run.
      mask: [composerStack, page.locator('[data-slot="turn-response-wait"]').getByText(/^\d+s$/)],
    },
    attention: { region: attention, mask: [] },
    composer: { region: composerStack, mask: [attention] },
  };
  for (const name of regions) {
    const { region, mask } = surfaces[name];
    await expectRegionScreenshot(region, `${prefix}-${name}.png`, { ...budget, mask });
  }
}

setupWorkspaceBrowser();

test('opens the unresolved task from the status strip in the actual task view', async ({
  page,
}) => {
  await page.route('**/v1/sessions/sess_flat_ndp/async-processes*', async (route) => {
    await route.fulfill({
      json: {
        processes: [
          {
            id: 'task_visibility_unresolved',
            handle: 'task_visibility_unresolved',
            kind: 'mcp',
            task_kind: 'MCP',
            title: 'Prepare dataset',
            description: 'Prepare the selected dataset for analysis.',
            status: 'working',
            raw_status: 'working',
            live_state: 'task_state_uncertain',
            effective_status: 'task_state_uncertain',
            connection_freshness: 'lost',
            metadata: {},
          },
        ],
      },
    });
  });
  await page.goto(workspaceUrl);
  const inspect = page.getByRole('button', { name: 'Inspect unresolved tasks' });
  await expect(inspect).toHaveText(/running; 1 task needs inspection$/);
  await inspect.click();
  const canvas = page.getByRole('complementary', { name: 'Workspace canvas' });
  const activity = canvas.getByRole('region', { name: 'Activity list', exact: true });
  await expect(activity).toBeVisible();
  // Activity leads with its timeline; every event, each task openable, is the Events view.
  await activity.getByRole('button', { name: 'Activity views', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Events', exact: true }).click();
  const task = activity.getByRole('button', { name: 'Prepare dataset, needs inspection' });
  await expect(task).toContainText('needs inspection');
  await task.click();
  await expect(canvas.getByRole('tab', { name: 'Prepare dataset', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(canvas.getByRole('toolbar', { name: 'Activity actions' })).toContainText(
    'needs inspection',
  );
});

test('keeps Activity views in their header and scrolls only their content vertically', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto(workspaceUrl);
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => window.localStorage.setItem('theme', value), theme);
    await page.reload();
    await waitForArtifactPreview(page);
    await page.evaluate(() => document.fonts.ready);
    const rail = await openConversationRail(page);
    await rail.getByRole('button', { name: 'Open full view' }).click();
    const canvas = page.getByRole('complementary', { name: 'Workspace canvas' });
    // Full details lands on the Activity tab, which leads with its timeline.
    await expect(canvas.locator('[data-slot="activity-session"]')).toBeVisible();
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

    // The views are rows of the header's Activity views menu, not a second tab strip.
    const list = canvas.getByRole('region', { name: 'Activity list', exact: true });
    const views = list.getByRole('button', { name: 'Activity views', exact: true });
    const viewTitle = () => list.getByRole('heading', { level: 2 });
    for (const mode of ['docked', 'maximized'] as const) {
      if (mode === 'maximized') {
        await canvas.getByRole('button', { name: 'Maximize canvas' }).click();
      }
      for (const [label, title] of [
        ['Timeline', 'Activity'],
        ['Context', 'Context'],
      ] as const) {
        const row = page.getByRole('menuitemradio', { name: label, exact: true });
        // The trigger keeps focus as the last choice's menu closes; open it once that settles.
        await expect(async () => {
          if (!(await row.isVisible())) await views.click();
          await row.click({ timeout: 1_000 });
          await expect(viewTitle()).toHaveText(title, { timeout: 1_000 });
        }).toPass({ timeout: 10_000 });
        const metrics = await viewTitle().evaluate((heading) => {
          const header = heading.parentElement!;
          const bounds = header.getBoundingClientRect();
          return {
            verticalOverflow: header.scrollHeight - header.clientHeight,
            horizontalOverflow: header.scrollWidth - header.clientWidth,
            controls: Array.from(header.querySelectorAll<HTMLElement>('button')).map((child) => ({
              top: child.getBoundingClientRect().top - bounds.top,
              bottom: child.getBoundingClientRect().bottom - bounds.bottom,
            })),
          };
        });
        expect(metrics.verticalOverflow).toBeLessThanOrEqual(1);
        expect(metrics.horizontalOverflow).toBeLessThanOrEqual(1);
        for (const child of metrics.controls) {
          expect(child.top).toBeGreaterThanOrEqual(0);
          expect(child.bottom).toBeLessThanOrEqual(0);
        }
      }
      // A short window makes this real context content overflow in both modes.
      await page.setViewportSize({ width: 1280, height: 400 });
      const content = list.locator('[data-slot="scroll-area-viewport"]').first();
      await content.hover();
      await page.mouse.wheel(0, 1500);
      await expect.poll(() => content.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      await expect(views).toBeInViewport();
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
    name: 'New conversation in flat-NDP',
    exact: true,
    includeHidden: true,
  });
  const overflow = page.getByRole('button', {
    name: 'Workspace actions for flat-NDP',
    exact: true,
    includeHidden: true,
  });
  const actions = newSession.locator('..');
  await page.mouse.move(1090, 790);
  await expect(actions).toHaveCSS('opacity', '0');
  await page.screenshot({ path: testInfo.outputPath('workspace-row-at-rest.png') });
  await disclosure.hover();
  await newSession.hover();
  await expect(actions).toHaveCSS('opacity', '1');
  await expect(page.locator('[data-slot="hover-card-content"]')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('workspace-row-hover.png') });
  await newSession.click();
  // A new conversation is a draft in place in that workspace (full-picture/08).
  await expect(page).toHaveURL(/\/workspaces\/ws_flat_ndp\/new$/u);
  await expect(page.getByRole('dialog', { name: 'Create', exact: true })).toHaveCount(0);
  await page.goBack();
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
  await expect(
    menu.getByRole('menuitem', { name: 'Workspace settings…', exact: true }),
  ).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'New session', exact: true })).toHaveCount(0);
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  await menu.getByRole('menuitem', { name: 'Workspace settings…', exact: true }).hover();
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
    if (payload.sessions.length === 0) return route.fulfill({ response, json: payload });
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
        (element) => element.closest('[data-slot="list-row"]')?.getBoundingClientRect().height,
      ),
    ).toBe(28);
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
  const attention = page.getByRole('region', { name: 'Agent needs your attention' });
  await expect(attention).toBeVisible();
  await settleConversationAtLatest(page);
  // Activity rows are always visible; the agent's answering states read without opening anything.
  await expect(page.locator('[data-agent-question-state="answering"]')).toContainText(
    'Agent is reading conversation context',
  );
  await expect(page.locator('[data-agent-question-state="answered"]')).toContainText(
    'Agent responded',
  );

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
  // A decision card expands its technical details in place, under its options.
  const fallbackToggle = fallback.getByRole('button', { name: 'Technical details' });
  await fallbackToggle.click();
  const fallbackDetails = fallback.getByRole('region', { name: 'Technical details' });
  await expect(fallbackDetails.getByText('agent_answer_timeout')).toBeVisible();
  await fallbackToggle.click();
  await expect(fallbackDetails).toHaveCount(0);

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
    .toContain(`${fixtureEndpoint}:tools/call`);
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
  await expect(page.locator('iframe[data-mcp-app-iframe="app_fixture_1"]')).toHaveCount(0);
  await expect(page.locator('iframe[data-mcp-app-iframe="app_fixture_2"]')).toHaveCount(1);
  await expect(page.getByText('MCP v2 exerciser view closed')).toBeVisible();
  await expect(page.locator('iframe[data-mcp-app-iframe="app_fixture_1"]')).toHaveCount(0);
  await expect(page.locator('iframe[data-mcp-app-iframe="app_fixture_2"]')).toHaveCount(1);
});

async function openDenseFlatNdp(page: Page) {
  await page.goto(workspaceUrl);
  await expect(page).toHaveURL(new RegExp(`${workspaceUrl}$`));
  await expect(page.getByText('EarthScope NDP evidence review').first()).toBeVisible();
  await waitForArtifactPreview(page);
}

test('renders and answers dense flat-NDP attention requests over the transcript', async ({
  page,
}, testInfo) => {
  await openDenseFlatNdp(page);
  await expect(page.getByText('flat-NDP').first()).toBeVisible();
  const modelButton = page.getByRole('button', { name: 'Change model' });
  await expect(modelButton).toContainText('codex / luna 5.6');
  // A short route stays on the label's one line beside the model.
  expect(
    await modelButton.evaluate((node) => {
      const line = node.querySelector('[data-slot="model-choice-label"]')!.getBoundingClientRect();
      const route = node.querySelector('[data-slot="model-choice-provider"]')!;
      return route.getBoundingClientRect().bottom <= line.bottom + 1;
    }),
  ).toBe(true);
  await expect(page.getByText('D:\\science\\campaigns\\flat-NDP', { exact: true })).toHaveCount(0);
  const pendingResponses = page.getByRole('region', { name: 'Agent needs your attention' });
  await expect(pendingResponses).toBeVisible();
  await expect(page.getByRole('button', { name: 'Allow once' })).toBeVisible();
  await pendingResponses.getByRole('button', { name: 'Next request' }).click();
  await expect(pendingResponses.getByRole('button', { name: /Station table/ })).toBeVisible();
  await pendingResponses.getByRole('button', { name: 'Previous request' }).click();
  await settleConversationAtLatest(page);
  const conversation = page.getByRole('log', { name: 'Conversation' });
  const composerStack = page.locator('[data-slot="clio-composer-stack"]');
  await expect(composerStack).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(composerStack).toHaveCSS('background-image', 'none');
  await expect(composerStack.locator('..')).toHaveCSS('position', 'absolute');
  const responseSurface = await pendingResponses
    .locator('[data-slot="ask-card"]:visible')
    .first()
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(responseSurface).not.toBe('rgba(0, 0, 0, 0)');
  const expandedConversationBounds = await conversation.boundingBox();
  const expandedComposerBounds = await composerStack.boundingBox();
  expect(expandedConversationBounds).not.toBeNull();
  expect(expandedComposerBounds).not.toBeNull();
  expect(expandedComposerBounds?.y ?? 0).toBeLessThan(
    (expandedConversationBounds?.y ?? 0) + (expandedConversationBounds?.height ?? 0),
  );
  await expect
    .poll(async () => {
      const composer = await composerStack.boundingBox();
      const paddingBottom = await conversation.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).paddingBottom),
      );
      return Math.abs(paddingBottom - (composer?.height ?? 0));
    })
    .toBeLessThanOrEqual(2);
  const approvalTitle = pendingResponses.getByText('Read the station evidence table', {
    exact: true,
  });
  await expect(approvalTitle).toBeVisible();
  const approvalIcon = pendingResponses.locator('[data-interaction-kind=permission] svg').first();
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

  // Re-settle the native scroll container, then pin the final semantic block
  // to the viewport edge so the screenshots cannot alternate between the
  // attachment and Activity rows above it.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await settleConversationAtLatest(page);
  // The outline is a popover now; open it to confirm the reader is at the latest turn.
  await page.getByRole('button', { name: 'Open transcript outline' }).click();
  const outline = page.getByRole('dialog', { name: 'Transcript outline' });
  await expect(
    outline.getByRole('button', { name: 'Jump to assistant message 1001' }),
  ).toHaveAttribute('aria-current', 'location');
  await page.keyboard.press('Escape');
  await expect(outline).toHaveCount(0);
  await alignLatestActivityAtTop(page);
  await page.mouse.move(600, 30);
  await expect(page.locator('[data-slot="hover-card-content"]')).toHaveCount(0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await alignLatestActivityAtTop(page);
  // The reviewed baselines reflect reader-controlled collapsed activity and the
  // completion footer's separate fields. The budget absorbs sub-row
  // anti-aliasing at the latest-anchored transcript's top edge and the live
  // ubuntu-22.04 runner's font-rasterization drift, which the official
  // mcr.microsoft.com/playwright:v1.62.1-jammy image does not reproduce. A real
  // layout regression moves orders of magnitude more.
  await page.screenshot({ path: testInfo.outputPath('workspace-desktop-reviewed.png') });
  await expectWorkspaceRegions(
    page,
    'workspace-desktop-dark',
    ['left-bar', 'header', 'transcript', 'attention', 'composer'],
    { animations: 'allow', maxDiffPixels: desktopMaxDiffPixels },
  );

  await page.getByRole('button', { name: 'Allow once' }).click();
  await expect(page.getByText('Read the station evidence table')).toHaveCount(0);

  await page.getByRole('button', { name: /Station table/ }).click();
  await expect(page.getByText('Which evidence view should remain primary?')).toHaveCount(0);
});

test('indexes the dense flat-NDP transcript in its outline', async ({ page }) => {
  await openDenseFlatNdp(page);
  await settleConversationAtLatest(page);
  const conversation = page.getByRole('log', { name: 'Conversation' });
  await expect(conversation).toHaveCSS('scrollbar-width', 'thin');
  // The spec has no landmark strip beside the transcript; the outline is its index.
  await expect(page.getByRole('complementary', { name: 'Transcript minimap' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open transcript outline' }).click();
  const outline = page.getByRole('dialog', { name: 'Transcript outline' });
  // #1339's compaction checkpoint makes the active streaming turn message 1001.
  await expect(
    outline.getByRole('button', { name: 'Jump to assistant message 1001' }),
  ).toHaveAttribute('aria-current', 'location');
  await outline
    .locator('[data-slot="transcript-outline-list"]')
    .evaluate((element) => element.scrollTo({ top: 0 }));
  const first = outline.getByRole('button', { exact: true, name: 'Jump to user message 1' });
  await first.hover();
  const preview = page.getByRole('region', { name: 'user message 1 preview' });
  await expect(preview.locator('p.font-semibold')).toHaveText('Sanitized evidence ledger entry 1.');
  await expect(preview.getByText(/\*\*evidence ledger\*\*/)).toHaveCount(0);
  await first.click();
  await expect(outline).toHaveCount(0);
  await expect
    .poll(() => conversation.evaluate((element) => element.scrollTop))
    .toBeLessThan(2_000);
});
/** Open the canvas pocket on the dense session; an empty pocket starts on the Files list. */
async function openDenseFlatNdpCanvas(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openDenseFlatNdp(page);
  await page.getByRole('button', { name: 'Open workspace canvas' }).click();
  const canvas = page.getByRole('complementary', { name: 'Workspace canvas' });
  await expect(canvas).toBeVisible();
  await expect(canvas.getByRole('region', { name: 'Files list' })).toBeVisible();
  return canvas;
}

test('keeps the dense flat-NDP canvas tabs and maximize accessible', async ({ page }) => {
  const canvas = await openDenseFlatNdpCanvas(page);
  await expectRegionScreenshot(canvas, 'workspace-desktop-dark-canvas.png', {
    animations: 'allow',
    maxDiffPixels: desktopMaxDiffPixels,
  });
  // A fresh pocket opens on Files; Activity opens from the strip as a closable tab.
  await expect(canvas.getByRole('tab', { name: 'Files' })).toHaveAttribute('aria-selected', 'true');
  await showWorkbenchList(page, 'Activity');
  const observabilityTab = canvas.getByRole('tab', { name: 'Activity' });
  // The X on a tab is a pointer affordance only. A tablist may own nothing but
  // tabs and a tab's children are presentational, so an interactive close
  // control is a critical violation on either side of the trigger; assistive
  // tech closes the tab through the Delete shortcut announced with it.
  const observabilityClose = observabilityTab
    .locator('..')
    .locator('[data-slot="frame-tab-close"]');
  await expect(observabilityTab).toHaveAttribute(
    'aria-keyshortcuts',
    process.platform === 'darwin' ? 'Meta+Backspace' : 'Delete',
  );
  await expect(observabilityClose).toHaveAttribute('aria-hidden', 'true');
  await expect(canvas.getByRole('button', { name: /^Close / })).toHaveCount(0);
  await page.getByRole('button', { name: 'Maximize canvas' }).click();
  // Maximized keeps the strip; the layout itself is guarded by canvas--maximized screens.
  await expect(canvas.getByRole('toolbar', { name: 'Workbench lists' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Maximize canvas' })).toBeVisible();
});

test('audits the dense flat-NDP workspace with its canvas open and requests pending', async ({
  page,
}) => {
  const canvas = await openDenseFlatNdpCanvas(page);
  await expect(canvas.getByRole('tab', { name: 'Files' })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  // axe walks the whole dense transcript, so this test does nothing else.
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test('keeps a pending EarthScope map flat, resizable, and centered when expanded', async ({
  page,
}) => {
  const seeded = await page.request.post(`${fixtureEndpoint}/__test/a2ui-map-demo`, {
    data: { enabled: true },
  });
  expect(seeded.ok()).toBe(true);

  await page.goto(workspaceUrl);
  await expect(page).toHaveURL(new RegExp(`${workspaceUrl}$`));
  const pendingResponses = page.getByRole('region', { name: 'Agent needs your attention' });
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
  const viewportHeight = () =>
    viewport.evaluate((element) => element.getBoundingClientRect().height);
  const initialHeight = await viewportHeight();
  // The tray fits its content up to the window's cap; the button toggles
  // between that cap and the compact height, so a map already at the cap
  // first goes compact and then grows back to its limit.
  const resizeButton = pendingResponses.getByRole('button', {
    name: 'Resize interactive surface',
  });
  await resizeButton.click();
  await expect.poll(viewportHeight).not.toBe(initialHeight);
  const toggledHeight = await viewportHeight();
  if (toggledHeight < initialHeight) {
    await resizeButton.click();
    await expect.poll(viewportHeight).toBeGreaterThan(toggledHeight);
  }

  const enlargedHeight = await viewport.evaluate(
    (element) => element.getBoundingClientRect().height,
  );
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
    // The keyboard resize button has already grown the tray to its limit.
    // Drag downward to shrink it before checking that an upward drag grows it.
    await page.mouse.move(cornerX, cornerY + 15, { steps: 5 });
    await page.mouse.move(cornerX, cornerY + 30, { steps: 5 });
    await page.mouse.up();
    await expect
      .poll(() => viewport.evaluate((element) => element.getBoundingClientRect().height))
      .toBeLessThan(enlargedHeight);
    const smallerHeight = await viewport.evaluate(
      (element) => element.getBoundingClientRect().height,
    );
    const smallerCornerBox = await corner.boundingBox();
    expect(smallerCornerBox).not.toBeNull();
    if (smallerCornerBox) {
      const smallerX = smallerCornerBox.x + smallerCornerBox.width / 2;
      const smallerY = smallerCornerBox.y + smallerCornerBox.height / 2;
      await page.mouse.move(smallerX, smallerY);
      await page.mouse.down();
      await page.mouse.move(smallerX, smallerY - 15, { steps: 5 });
      await page.mouse.move(smallerX, smallerY - 30, { steps: 5 });
      await page.mouse.up();
      await expect
        .poll(() => viewport.evaluate((element) => element.getBoundingClientRect().height))
        .toBeGreaterThan(smallerHeight);
    }
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
  expect(dialogBounds).not.toBeNull();
  expect(pageSize).not.toBeNull();
  if (dialogBounds && pageSize) {
    expect(dialogBounds.width).toBeGreaterThan(pageSize.width * 0.5);
    expect(dialogBounds.width).toBeLessThan(pageSize.width * 0.9);
    expect(Math.abs(dialogBounds.x + dialogBounds.width / 2 - pageSize.width / 2)).toBeLessThan(1);
    expect(Math.abs(dialogBounds.y + dialogBounds.height / 2 - pageSize.height / 2)).toBeLessThan(
      1,
    );
  }
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
}, testInfo) => {
  await page.setViewportSize({ width: 720, height: 900 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('theme', 'light'));
  await page.goto(workspaceUrl);

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: 'Open workspace canvas' })).toBeVisible();
  await waitForArtifactPreview(page);
  // Capture a settled transcript. Without this the shot races the scroll to the
  // latest turn, so the last messages land a few pixels off and the scroll-to-bottom
  // affordance is present in some runs and gone in others — a baseline that
  // matches about half the time.
  await settleConversationAtLatest(page);
  await alignTranscriptAnchorAtTop(page, page.locator('[data-slot="delegate"]').first());
  await page.screenshot({ path: testInfo.outputPath('workspace-mobile-reviewed.png') });
  await expectWorkspaceRegions(
    page,
    'workspace-mobile-light-reduced',
    ['header', 'transcript', 'attention', 'composer'],
    { animations: 'disabled', maxDiffPixels: mobileMaxDiffPixels },
  );

  await page.getByRole('button', { name: 'Open transcript outline' }).click();
  const outline = page.getByRole('dialog', { name: 'Transcript outline' });
  await expect(outline).toBeVisible();
  await expect(outline).toHaveCSS('resize', 'both');
  expect(await outline.locator('[data-index]').count()).toBeLessThan(30);
  const finalOutlineRow = outline.locator('[data-index="999"]');
  await expect(finalOutlineRow).toBeVisible();
  await expect(finalOutlineRow).toHaveCSS('white-space', 'nowrap');
  expect((await finalOutlineRow.boundingBox())?.height).toBe(28);
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
    // The popover transitions its native CSS resize dimensions. Measure after
    // they reach the requested size, rather than during the final pointer frame.
    await expect
      .poll(async () => (await outline.boundingBox())?.width ?? 0)
      .toBeGreaterThan(outlineBounds.width + 40);
    await expect
      .poll(async () => (await outline.boundingBox())?.height ?? 0)
      .toBeGreaterThan(outlineBounds.height + 20);
  }
  await outline.locator('[data-slot="transcript-outline-list"]').evaluate((element) => {
    element.scrollTop = 0;
  });
  const firstOutlineItem = outline.getByRole('button', {
    exact: true,
    name: 'Jump to user message 1',
  });
  await expect(firstOutlineItem).toBeVisible();
  await expect(firstOutlineItem).toContainText('Sanitized evidence ledger entry 1.');
  await expect(outline.locator('[data-index="0"]')).toContainText(
    'Sanitized evidence ledger entry 2.',
  );
  await expect(outline.getByText(/\*\*evidence ledger\*\*/)).toHaveCount(0);
  await firstOutlineItem.hover();
  const firstMessagePreview = page.getByRole('region', { name: 'user message 1 preview' });
  await expect(firstMessagePreview).toContainText('Sanitized evidence ledger entry 1.');
  await expect(firstMessagePreview).toContainText('Sanitized evidence ledger entry 2.');
  await firstOutlineItem.click();
  await expect(firstMessagePreview).toHaveCount(0);
  await expect(outline).toHaveCount(0);

  await page.getByRole('button', { name: 'Open workspace canvas' }).click();
  await expect(page.getByRole('dialog', { name: 'Workspace canvas' })).toBeVisible();
  await expect(
    page.getByRole('dialog', { name: 'Workspace canvas' }).getByRole('toolbar', {
      name: 'Workbench lists',
    }),
  ).toBeVisible();
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
  const heldSteers = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith('/pending-steers'),
  );
  await page.goto(workspaceUrl);
  expect((await heldSteers).ok()).toBe(true);

  // The service holds one accepted steer on the prompt a reply already
  // follows. That is the running turn's own input, not a queued one, so it
  // is neither marked Queued nor offered for cancellation.
  await expect(
    page
      .getByRole('log', { name: 'Conversation' })
      .getByText('Review the EarthScope station evidence and keep provenance visible.', {
        exact: true,
      }),
  ).toBeVisible();
  await expect(page.getByText('Queued', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cancel pending message' })).toHaveCount(0);

  const componentStatusResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === 'GET' &&
      url.pathname === '/v1/providers/codex/components' &&
      url.searchParams.get('refresh') === 'true'
    );
  });
  await page.getByRole('button', { name: 'Change model' }).click();
  const componentStatus = await componentStatusResponse;
  expect(componentStatus.ok()).toBe(true);
  expect(providerComponentsSchema.parse(await componentStatus.json())).toMatchObject({
    provider_id: 'codex',
    provider_kind: 'codex',
    installed: true,
    update_available: false,
    components: [],
  });
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
  // A hidden welcome screen must leave the flex layout after hydration.
  // Otherwise it takes half the height while the transcript is squeezed below it.
  await expect
    .poll(async () => {
      const surface = (await page.locator('[data-slot="session-transcript"]').boundingBox())!;
      const transcript = (await page.getByRole('log', { name: 'Conversation' }).boundingBox())!;
      return transcript.y - surface.y;
    })
    .toBeLessThan(2);
  await expect(queue).toBeVisible();
  await expect(queue.getByText('6 queued messages')).toBeVisible();
  await expect(queue.locator('[data-queue-live-item]')).toHaveCount(6);
  await expect(queue).toHaveCSS('backdrop-filter', 'none');
  const composerSurface = page.locator(
    '[data-slot="clio-composer-stack"] form > [data-slot="input-group"]',
  );
  await expect
    .poll(() => queue.evaluate((node) => getComputedStyle(node).backgroundColor))
    .toBe(await composerSurface.evaluate((node) => getComputedStyle(node).backgroundColor));
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
  // The top toolbar exposes the conversation rail button. The
  // persistent live region retains work status without a second visible badge.
  const observabilityDock = page.getByRole('button', { name: 'Conversation rail', exact: true });
  await expect(observabilityDock).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('[aria-live="polite"]').filter({ hasText: /^Working$/ })).toHaveCount(
    1,
  );
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
  // A card gives up body height before its options, so the stack itself only
  // overflows once the header, options and details line exceed 45dvh.
  await page.setViewportSize({ height: 400, width: 848 });
  const seeded = await page.request.post(`${fixtureEndpoint}/__test/queue-demo`);
  expect(seeded.ok()).toBe(true);
  await page.goto(workspaceUrl);

  const pendingResponses = page.getByRole('region', { name: 'Agent needs your attention' });
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
    // Over the sticky header rather than the centre: a capped card body is its own
    // scroller and would take the wheel.
    await viewport.hover({ position: { x: 24, y: 8 } });
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
  // Park the responses a third of the way down: once the queue scrolls, the
  // composer gives both panels a few more pixels, which would clamp an offset
  // parked at the end without anything having chained into it.
  previousResponseScroll = await responseViewport.evaluate((element) => {
    element.scrollTop = Math.floor((element.scrollHeight - element.clientHeight) / 3);
    return element.scrollTop;
  });
  expect(previousResponseScroll).toBeGreaterThan(0);
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

test('shows summarization as one quiet line and discloses its exact received text', async ({
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
  const disclosure = compactionRow.getByRole('button', {
    name: 'Compacted here, earlier messages summarized',
    exact: true,
  });
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  await expect(disclosure).toHaveAccessibleDescription('Started automatically');
  await expect(compactionRow).not.toContainText('EarthScope station evidence ledger');
  // Scroll the row to the top of the viewport: it sits near the tail of the
  // transcript, close enough to the composer that the floating "Agent needs
  // your response" queue (docked at the bottom) would otherwise cover it.
  await compactionRow.evaluate((element) =>
    element.scrollIntoView({ behavior: 'instant', block: 'start' }),
  );
  // Capture the baseline's unhovered state, independently of the pointer's prior position.
  await page.mouse.move(0, 0);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(compactionRow).toHaveScreenshot('summarization-disclosure-collapsed.png', {
    animations: 'disabled',
  });

  await disclosure.click();
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  await expect(compactionRow).toContainText('EarthScope station evidence ledger');
  await expect(
    compactionRow.getByText(/derived displacement series before this checkpoint/),
  ).toBeVisible();
  await disclosure.click();
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  await expect(compactionRow).not.toContainText('EarthScope station evidence ledger');
});
