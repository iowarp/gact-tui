import { expect, test, type Page } from '@playwright/test';

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
};

async function rect(page: Page, selector: string): Promise<Rect> {
  const locator = page.locator(selector);
  await expect(locator).toBeVisible();
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      right: r.right,
      bottom: r.bottom,
    };
  });
}

test.describe('app shell layout', () => {
  test('topbar owns the full header row and sessions start below it', async ({ page }) => {
    await page.goto('/?route=chat&fixture=streaming');

    const topbar = await rect(page, '.chat__topbar');
    const sessions = await rect(page, '.sx');
    const brand = await rect(page, '.chat__brand-lockup');
    const title = await rect(page, '.chat__session-title');
    const actions = await rect(page, '.chat__topbar-actions');

    expect(topbar.x).toBe(0);
    expect(topbar.y).toBe(0);
    expect(topbar.width).toBe(page.viewportSize()!.width);
    expect(sessions.y).toBe(topbar.bottom);
    expect(sessions.x).toBe(0);
    expect(sessions.height + topbar.height).toBe(page.viewportSize()!.height);
    expect(brand.x).toBeGreaterThanOrEqual(topbar.x);
    expect(brand.right).toBeLessThanOrEqual(sessions.right + 24);
    expect(title.x + title.width / 2).toBeCloseTo(page.viewportSize()!.width / 2, 1);
    expect(actions.right).toBeLessThanOrEqual(topbar.right);
  });

  test('empty-state tip is centered with the prompt grid', async ({ page }) => {
    await page.goto('/?route=chat&fixture=empty-sidebar');

    const prompts = await rect(page, '.chat__empty-prompts');
    const tip = await rect(page, '.chat__empty-tip');
    const promptCenter = prompts.x + prompts.width / 2;
    const tipCenter = tip.x + tip.width / 2;

    expect(Math.abs(promptCenter - tipCenter)).toBeLessThanOrEqual(4);
  });
});
