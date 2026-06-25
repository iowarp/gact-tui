/**
 * FONT checkpoint (RENDERING_SPEC §2.4 + verification): every text node inside
 * the rendered transcript computes to a readable size — NO font-size 10/10.5/11/
 * 11.5/12.5px chrome anywhere in `[data-testid="transcript"]`. Differentiate by
 * weight/color only, never by tiny per-element font sizes.
 */
import { test, expect } from '@playwright/test';
import { connectMockBackend } from './mock-backend';

test.describe('transcript font checkpoint', () => {
  test('no sub-12.5px text inside the transcript', async ({ page }) => {
    await connectMockBackend(page, 'earthscope-real');
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('assistant-turn')).toBeVisible();

    const offenders = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="transcript"]');
      if (!root) return [{ text: '(no transcript root)', size: 0, cls: '' }];
      const bad: Array<{ text: string; size: number; cls: string }> = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node: Node | null = walker.nextNode();
      while (node) {
        const text = (node.textContent ?? '').trim();
        const el = node.parentElement;
        if (text && el) {
          const size = parseFloat(getComputedStyle(el).fontSize);
          if (Number.isFinite(size) && size < 12.5) {
            bad.push({ text: text.slice(0, 40), size, cls: el.className });
          }
        }
        node = walker.nextNode();
      }
      return bad;
    });

    expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([]);
  });
});
