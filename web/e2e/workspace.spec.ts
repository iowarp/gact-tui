import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const fixturePort = Number.parseInt(process.env['CLIO_FIXTURE_PORT'] ?? '18799', 10);
const fixtureEndpoint = `http://127.0.0.1:${fixturePort}`;
const workspaceUrl = '/workspaces/ws_flat_ndp/sessions/sess_flat_ndp';
const unexpectedErrors = new WeakMap<Page, string[]>();

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
    localStorage.setItem('clio.recent-connections', JSON.stringify([endpoint]));
  }, fixtureEndpoint);
});

test.afterEach(async ({ page }) => {
  expect(unexpectedErrors.get(page) ?? []).toEqual([]);
});

test('renders dense flat-NDP semantics with accessible interactions', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(new RegExp(`${workspaceUrl}$`));

  await expect(page.getByText('EarthScope NDP evidence review').first()).toBeVisible();
  await expect(page.getByText('flat-NDP').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose model' })).toContainText('gpt-5.6-luna');
  await expect(page.getByText('D:\\science\\campaigns\\flat-NDP', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Agent needs your response' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Allow once' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send response' })).toBeDisabled();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect(page).toHaveScreenshot('workspace-desktop-dark.png', { animations: 'disabled' });

  await page.getByRole('button', { name: 'Open workspace canvas' }).click();
  const canvas = page.getByRole('complementary', { name: 'Workspace canvas' });
  await expect(canvas).toBeVisible();
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

test('keeps navigation and workspace canvas accessible on mobile with reduced motion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 900 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('theme', 'light'));
  await page.goto(workspaceUrl);

  await expect(page.locator('html')).toHaveClass(/light/);
  await expect(page.getByRole('button', { name: 'Open workspace canvas' })).toBeVisible();
  await expect(page).toHaveScreenshot('workspace-mobile-light-reduced.png', {
    animations: 'disabled',
  });

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

test('batches a 100-delta stream over a virtualized 1,000-message transcript', async ({ page }) => {
  await page.addInitScript(() => {
    window.__clioLongTasks = [];
  });
  await page.goto(workspaceUrl);
  await expect(page.getByRole('log', { name: 'Conversation' })).toBeVisible();

  const renderedRows = page.locator('[data-index]');
  expect(await renderedRows.count()).toBeLessThan(50);

  await page.getByRole('log', { name: 'Conversation' }).evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.getByRole('log', { name: 'Conversation' }).evaluate((element) => {
    window.__clioLongTasks = [];
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
  await expect(page.getByText(/delta-99/)).toBeVisible({ timeout: 10_000 });

  const measurements = await page
    .getByRole('log', { name: 'Conversation' })
    .evaluate((element) => ({
      bottomGap: element.scrollHeight - element.scrollTop - element.clientHeight,
      animationFrames: window.__clioAnimationFrames,
      longTasks: window.__clioLongTasks,
      streamMutationBatches: window.__clioStreamMutationBatches,
      transcriptMutationBatches: window.__clioTranscriptMutationBatches,
    }));
  expect(measurements.longTasks.filter((duration) => duration > 50)).toEqual([]);
  expect(measurements.streamMutationBatches).toBeGreaterThan(0);
  expect(measurements.streamMutationBatches).toBeLessThanOrEqual(100);
  expect(measurements.streamMutationBatches).toBeLessThanOrEqual(measurements.animationFrames + 2);
  expect(measurements.transcriptMutationBatches).toBeLessThan(100);
  expect(Math.abs(measurements.bottomGap)).toBeLessThanOrEqual(2);
});

declare global {
  interface Window {
    __clioLongTasks: number[];
    __clioAnimationFrames: number;
    __clioStreamMutationBatches: number;
    __clioTranscriptMutationBatches: number;
  }
}
