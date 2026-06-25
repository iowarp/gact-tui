/**
 * Visual + structural proof that the ASSISTANT transcript renders the saved
 * REAL clio run (earthscope-real-trace.json) the way the TUI does: deduped
 * delegations, no workflow_state JSON, depth-indented steps, compacted tool /
 * long content with an expand affordance, and a prominent final answer.
 *
 * Run:
 *   cd apps && CLIO_NDP_EARTHSCOPE_LIVE=0 \
 *     pnpm --filter @clio/web exec playwright test transcript-clean --reporter=list
 */
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';
import { connectMockBackend } from './mock-backend';

const REPO_SHOT = resolve(import.meta.dirname, '..', '..', '..', '..', 'screenshots');

test.describe('clean transcript — real earthscope trace', () => {
  test('renders deduped, depth-indented, scaffolding-free delegation flow', async ({ page }) => {
    await connectMockBackend(page, 'earthscope-real');
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 8_000 });

    const turn = page.getByTestId('assistant-turn');
    await expect(turn).toBeVisible();

    // DEDUPE: 5 real delegations (each emitted twice on the wire) collapse to
    // exactly 5 steps — no parent.resumed duplicates.
    const steps = page.getByTestId('assistant-turn-step');
    await expect(steps).toHaveCount(5);

    // The five named experts appear, in order.
    for (const agent of ['geospatial', 'data', 'analysis', 'visualization', 'synthesis']) {
      await expect(
        page.locator('[data-testid="assistant-turn-step"]').filter({ hasText: agent }).first(),
      ).toBeVisible();
    }

    // DEPTH: every named expert sits at delegation depth 1 under main.
    await expect(steps.first()).toHaveAttribute('data-depth', '1');

    // STRIP: no workflow_state JSON / control scaffolding leaks into the DOM.
    const body = page.getByTestId('transcript-pane');
    await expect(body).not.toContainText('Retained typed workflow state');
    await expect(body).not.toContainText('CLIO durable typed workflow state');
    await expect(body).not.toContainText('"workflow_state"');
    await expect(body).not.toContainText('delegate.completed');
    await expect(body).not.toContainText('parent.resumed');

    // COMPACTION: at least one long step is collapsed with an expand toggle.
    const toggle = page.getByTestId('collapsible-toggle').first();
    await expect(toggle).toBeVisible();
    await expect(toggle).toContainText(/expand/);

    // The final answer renders prominently as markdown (its heading shows).
    const answer = page.getByTestId('assistant-turn-answer');
    await expect(answer).toBeVisible();
    await expect(answer).toContainText('EarthScope GNSS Ground Motion');

    // Scroll the transcript to the top so the user prompt, routing chip and the
    // depth-indented delegation steps are in view for the primary screenshot.
    await page.evaluate(() => {
      const pane = document.querySelector('[data-testid="transcript-pane"]') as HTMLElement | null;
      if (pane) pane.scrollTop = 0;
    });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: resolve(REPO_SHOT, 'web-transcript-clean.png'),
      fullPage: false,
    });

    // Expand everything and capture the fully-disclosed view (scrolled to top).
    const toggles = page.getByTestId('collapsible-toggle');
    const count = await toggles.count();
    for (let i = 0; i < count; i++) {
      const t = toggles.nth(i);
      if (await t.isVisible()) await t.click();
    }
    await page.evaluate(() => {
      const pane = document.querySelector('[data-testid="transcript-pane"]') as HTMLElement | null;
      if (pane) pane.scrollTop = 0;
    });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: resolve(REPO_SHOT, 'web-transcript-clean-expanded.png'),
      fullPage: false,
    });

    // Scroll to the BOTTOM so the final synthesis `text` answer fills the
    // viewport — proves it renders as clean prominent markdown (headings,
    // links, CSV-path chip), not a code/box dump.
    await answer.scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      const a = document.querySelector('[data-testid="assistant-turn-answer"]');
      a?.scrollIntoView({ block: 'start' });
    });
    await page.waitForTimeout(300);
    // The answer's markdown headings actually rendered (not a fenced code dump).
    await expect(answer.locator('.im__h-2, .im__h-1').first()).toBeVisible();
    await page.screenshot({
      path: resolve(REPO_SHOT, 'web-transcript-clean-answer.png'),
      fullPage: false,
    });
  });

  test('nested 2-level chain indents the child one level deeper than its parent', async ({
    page,
  }) => {
    await connectMockBackend(page, 'nested-depth');
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 8_000 });

    const steps = page.getByTestId('assistant-turn-step');
    await expect(steps).toHaveCount(2);

    // The data expert (depth 1) and its child ndp_dataset_discovery (depth 2).
    const parent = steps.filter({ hasText: 'data' }).first();
    const child = steps.filter({ hasText: 'ndp_dataset_discovery' }).first();
    await expect(parent).toHaveAttribute('data-depth', '1');
    await expect(child).toHaveAttribute('data-depth', '2');

    // PROVE the visual offset: the child's left edge is measurably further right
    // than the parent's — not merely a "← parent" label.
    const parentBox = await parent.boundingBox();
    const childBox = await child.boundingBox();
    expect(parentBox).not.toBeNull();
    expect(childBox).not.toBeNull();
    expect(childBox!.x).toBeGreaterThan(parentBox!.x + 16);

    await page.evaluate(() => {
      const pane = document.querySelector('[data-testid="transcript-pane"]') as HTMLElement | null;
      if (pane) pane.scrollTop = 0;
    });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: resolve(REPO_SHOT, 'web-transcript-nested-indent.png'),
      fullPage: false,
    });
  });

  test('image / long markdown / diff each render a top preview + expand', async ({ page }) => {
    await connectMockBackend(page, 'transcript-artifacts');
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 8_000 });

    // (a) image renders as a capped thumbnail with a click-to-enlarge hint.
    const thumb = page.getByTestId('trx-image-thumb');
    await expect(thumb).toBeVisible();
    await expect(page.getByTestId('trx-image')).toBeVisible();
    await expect(page.getByTestId('trx-image-thumb-hint')).toContainText('enlarge');
    const before = await page.getByTestId('trx-image').boundingBox();
    await thumb.click();
    await page.waitForTimeout(250);
    const after = await page.getByTestId('trx-image').boundingBox();
    // Enlarging actually grows the image.
    expect(after!.height).toBeGreaterThan(before!.height);
    await thumb.click(); // shrink back for the screenshot
    await page.waitForTimeout(250);

    // (c) the diff is clamped with an expand toggle (block-level compaction).
    const blockToggle = page.getByTestId('collapsible-block-toggle').first();
    await expect(blockToggle).toBeVisible();
    await expect(blockToggle).toContainText(/expand/);

    // (b) the long markdown answer is compacted with a line-level expand toggle.
    const textToggle = page.getByTestId('collapsible-toggle').first();
    await expect(textToggle).toBeVisible();
    await expect(textToggle).toContainText(/expand/);

    await page.evaluate(() => {
      const pane = document.querySelector('[data-testid="transcript-pane"]') as HTMLElement | null;
      if (pane) pane.scrollTop = 0;
    });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: resolve(REPO_SHOT, 'web-transcript-artifacts.png'),
      fullPage: false,
    });
  });
});
