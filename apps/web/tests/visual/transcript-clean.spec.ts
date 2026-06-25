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
  });
});
