/**
 * Visual proof of the RENDER UNIFICATION: every turn — user prompt and assistant
 * turn alike — renders through the single AssistantTurnView path (no flat
 * fallback), and in-transcript search still highlights matches (restored on the
 * unified path). Screenshots land in the repo `screenshots/` dir for review.
 *
 * Run:
 *   cd apps && CLIO_NDP_EARTHSCOPE_LIVE=0 \
 *     pnpm --filter @clio/web exec playwright test unified-render-proof --reporter=list
 */
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';
import { connectMockBackend } from './mock-backend';

const REPO_SHOT = resolve(import.meta.dirname, '..', '..', 'screenshots');

test.describe('unified render proof', () => {
  test('one render path for user + assistant, with working search highlight', async ({ page }) => {
    await connectMockBackend(page, 'earthscope-real');
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 8_000 });

    // The assistant turn renders through AssistantTurnView (the single path).
    await expect(page.getByTestId('assistant-turn')).toBeVisible();
    // The USER prompt now renders through the SAME path (its own user-turn box).
    await expect(page.getByTestId('user-turn').first()).toBeVisible();

    await page.screenshot({
      path: resolve(REPO_SHOT, 'unified-render-full.png'),
      fullPage: true,
    });

    // Search: open the palette and type a term present in the answer. The unified
    // path highlights it in place (no swap to the retired flat render).
    await page.keyboard.press('ControlOrMeta+f');
    const searchInput = page.getByTestId('transcript-search-input');
    await expect(searchInput).toBeVisible({ timeout: 4_000 });
    await searchInput.fill('Angeles');

    const marks = page.locator('mark.tx-match');
    await expect(marks.first()).toBeVisible({ timeout: 4_000 });
    expect(await marks.count()).toBeGreaterThan(0);
    // The current match is keyed for autoscroll.
    await expect(page.locator('mark.tx-match--current').first()).toBeVisible();

    await page.screenshot({
      path: resolve(REPO_SHOT, 'unified-render-search-highlight.png'),
      fullPage: true,
    });
  });
});
