/**
 * Layout invariants that only a real browser can observe.
 *
 * jsdom does not load CSS, so `getComputedStyle` there reports nothing about
 * layout. Asserting a visual guarantee with a predicate that cannot see it is
 * worse than not asserting it — these run in Chromium, against real styles.
 */
import { expect, test } from '@playwright/test';

test('the user turn is a right-aligned bubble, not a full-width card', async ({ page }) => {
  await page.goto('/?shell');

  const bubble = page.locator('.transcript__message[data-role="user"]').first();
  await expect(bubble).toBeVisible();

  const layout = await bubble.evaluate((el) => {
    const style = getComputedStyle(el);
    const parentWidth = (el.parentElement as HTMLElement).clientWidth;
    return {
      alignSelf: style.alignSelf,
      borderRadius: style.borderRadius,
      widthRatio: el.getBoundingClientRect().width / parentWidth,
    };
  });

  expect(layout.alignSelf).toBe('flex-end');
  // The prototype's asymmetric corner: 12px 12px 4px 12px.
  expect(layout.borderRadius).toContain('4px');
  expect(layout.widthRatio).toBeLessThanOrEqual(0.79);
});

test('assistant output stays full width', async ({ page }) => {
  await page.goto('/?shell');
  const assistant = page.locator('.transcript__message[data-role="assistant"]').first();
  const alignSelf = await assistant.evaluate((el) => getComputedStyle(el).alignSelf);
  expect(alignSelf).not.toBe('flex-end');
});

test('an unrenderable part is visible, not dropped', async ({ page }) => {
  await page.goto('/?shell');
  const unknown = page.getByTestId('part-unrenderable');
  await expect(unknown).toBeVisible();
  await expect(unknown).toContainText('some_future_kind');
});
