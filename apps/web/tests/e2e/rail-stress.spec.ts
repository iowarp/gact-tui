/**
 * Slice B failing-first spec — overflow semantics under volume (B10/B13).
 *
 * Owner-reported: with enough workspaces the BODY becomes the scroller — the
 * footer band lands mid-page and the app trails into background. The shell is
 * viewport-locked; the rail's list is the ONLY rail scroller, exactly as the
 * transcript already enforces for its column.
 */
import { expect, test } from '@playwright/test';
import { connectMockBackend } from './mock-backend';

test('the body never scrolls; the rail list owns its overflow', async ({ page }) => {
  await connectMockBackend(page, { stress: true });
  await expect(page.getByRole('navigation', { name: /workspaces/i })).toBeVisible();

  const layout = await page.evaluate(() => {
    const scroller = document.scrollingElement!;
    const list = document.querySelector('.shell-rail__list');
    const foot = document.querySelector('.shell-rail__foot')?.getBoundingClientRect();
    return {
      bodyOverflow: scroller.scrollHeight - scroller.clientHeight,
      railListScrolls: list ? list.scrollHeight > list.clientHeight : null,
      footBottom: foot ? Math.round(foot.bottom) : null,
      viewport: window.innerHeight,
    };
  });

  expect(layout.bodyOverflow, 'the page itself must never scroll').toBe(0);
  expect(layout.railListScrolls, 'the rail list scrolls internally').toBe(true);
  expect(layout.footBottom, 'the footer band stays pinned to the viewport').toBe(layout.viewport);
});

test('show more truncates at five and expands on demand', async ({ page }) => {
  await connectMockBackend(page, { stress: true });
  await expect(page.getByRole('navigation', { name: /workspaces/i })).toBeVisible();

  const group = page.locator('.shell-rail__group', { hasText: 'stress-01' }).first();
  await expect(group.locator('.shell-rail__session')).toHaveCount(5);
  const more = page.getByRole('button', { name: /show more \(3\)/i });
  await expect(more).toBeVisible();
  await more.click();
  await expect(group.locator('.shell-rail__session')).toHaveCount(8);
});
